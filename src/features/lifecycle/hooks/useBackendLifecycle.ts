import { useEffect } from 'react';
import { backend } from '../../../services/backendAdapter';
import {
  loadDeferredReleases,
  startAutoSync,
  stopAutoSync,
  syncFromBackend,
  tryRestoreAuthFromBackend,
} from '../../../services/autoSync';

/** Delay used when requestIdleCallback is unavailable. */
const DEFERRED_RELEASES_FALLBACK_DELAY_MS = 1500;

type IdleWindow = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Pull releases once the first paint is done.
 *
 * They are the largest backend payload by far and the first screen renders
 * repositories only, so the startup pull leaves them out; this idle slot loads
 * them right after the first paint, before the regular 30s poll would.
 */
const scheduleDeferredReleasesLoad = (): (() => void) => {
  const idleWindow = window as unknown as IdleWindow;
  let cancelled = false;
  const load = () => {
    if (cancelled) return;
    void loadDeferredReleases();
  };

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(load, {
      timeout: DEFERRED_RELEASES_FALLBACK_DELAY_MS * 2,
    });
    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const handle = setTimeout(load, DEFERRED_RELEASES_FALLBACK_DELAY_MS);
  return () => {
    cancelled = true;
    clearTimeout(handle);
  };
};

/**
 * Owns application-wide backend startup after Store hydration.
 * Local state remains usable whenever backend probing or remote synchronization
 * fails, and the auto-sync subscription is released on unmount.
 */
export const useBackendLifecycle = (hasHydrated: boolean): void => {
  useEffect(() => {
    if (!hasHydrated) return;

    let unsubscribe: (() => void) | null = null;
    let cancelDeferredReleases: (() => void) | null = null;
    let cancelled = false;

    const initialize = async () => {
      try {
        await backend.init();
        if (backend.isAvailable && !cancelled) {
          // Session restoration must precede the data pull so a fresh browser
          // receives authentication state before it consumes backend records.
          await tryRestoreAuthFromBackend();
          // No local-token sync here: this Worker strips github_token from
          // PUT /settings (it uses the GITHUB_TOKEN secret), so the request
          // would only cost a cross-border round trip plus a D1 write.
          if (!cancelled) {
            await syncFromBackend();
          }
          if (!cancelled) {
            unsubscribe = startAutoSync();
            cancelDeferredReleases = scheduleDeferredReleasesLoad();
          }
        }
      } catch (error) {
        // Backend availability is optional. Preserve local-only application use.
        console.error('Failed to initialize backend:', error);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      if (cancelDeferredReleases) {
        cancelDeferredReleases();
      }
      if (unsubscribe) {
        stopAutoSync(unsubscribe);
      }
    };
  }, [hasHydrated]);
};
