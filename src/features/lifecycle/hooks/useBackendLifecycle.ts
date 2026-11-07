import { useEffect } from 'react';
import { backend } from '../../../services/backendAdapter';
import {
  startAutoSync,
  stopAutoSync,
  syncFromBackend,
  tryRestoreAuthFromBackend,
} from '../../../services/autoSync';

/**
 * Owns application-wide backend startup after Store hydration.
 * Local state remains usable whenever backend probing or remote synchronization
 * fails, and the auto-sync subscription is released on unmount.
 */
export const useBackendLifecycle = (hasHydrated: boolean): void => {
  useEffect(() => {
    if (!hasHydrated) return;

    let unsubscribe: (() => void) | null = null;
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
      if (unsubscribe) {
        stopAutoSync(unsubscribe);
      }
    };
  }, [hasHydrated]);
};
