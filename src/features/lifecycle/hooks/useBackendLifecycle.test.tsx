import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  const unsubscribe = vi.fn(() => calls.push('unsubscribe'));
  return {
    calls,
    unsubscribe,
    backend: {
      init: vi.fn(async () => { calls.push('backend.init'); }),
      isAvailable: true,
    },
    tryRestoreAuthFromBackend: vi.fn(async () => { calls.push('restore-auth'); return false; }),
    syncLocalGitHubTokenToBackend: vi.fn(),
    syncFromBackend: vi.fn(async () => { calls.push('sync-from-backend'); }),
    loadDeferredReleases: vi.fn(async () => { calls.push('load-deferred-releases'); }),
    startAutoSync: vi.fn(() => { calls.push('start-auto-sync'); return unsubscribe; }),
    stopAutoSync: vi.fn(() => { calls.push('stop-auto-sync'); }),
  };
});

vi.mock('../../../services/backendAdapter', () => ({ backend: mocks.backend }));
vi.mock('../../../services/autoSync', () => ({
  tryRestoreAuthFromBackend: mocks.tryRestoreAuthFromBackend,
  syncLocalGitHubTokenToBackend: mocks.syncLocalGitHubTokenToBackend,
  syncFromBackend: mocks.syncFromBackend,
  loadDeferredReleases: mocks.loadDeferredReleases,
  startAutoSync: mocks.startAutoSync,
  stopAutoSync: mocks.stopAutoSync,
}));

import { useBackendLifecycle } from './useBackendLifecycle';

describe('useBackendLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.splice(0);
    mocks.backend.isAvailable = true;
  });

  it('waits for hydration and restores authentication before backend data synchronization', async () => {
    const { rerender } = renderHook(({ hasHydrated }) => useBackendLifecycle(hasHydrated), {
      initialProps: { hasHydrated: false },
    });

    expect(mocks.backend.init).not.toHaveBeenCalled();

    rerender({ hasHydrated: true });
    await waitFor(() => expect(mocks.startAutoSync).toHaveBeenCalledOnce());

    expect(mocks.calls).toEqual([
      'backend.init',
      'restore-auth',
      'sync-from-backend',
      'start-auto-sync',
    ]);
    // The Worker strips github_token from PUT /settings, so startup must not
    // spend a request on it; manual settings actions still trigger the sync.
    expect(mocks.syncLocalGitHubTokenToBackend).not.toHaveBeenCalled();
  });

  it('schedules the releases pull off the startup path and cancels it on unmount', async () => {
    type IdleWindow = {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const idleWindow = window as unknown as IdleWindow;
    const originalRequestIdleCallback = idleWindow.requestIdleCallback;
    const originalCancelIdleCallback = idleWindow.cancelIdleCallback;
    const idleCallbacks: Array<() => void> = [];
    const cancelIdleCallback = vi.fn();
    const requestIdleCallback = vi.fn((callback: () => void) => {
      idleCallbacks.push(callback);
      return 1;
    });
    idleWindow.requestIdleCallback = requestIdleCallback;
    idleWindow.cancelIdleCallback = cancelIdleCallback;

    try {
      const { unmount } = renderHook(() => useBackendLifecycle(true));
      await waitFor(() => expect(mocks.startAutoSync).toHaveBeenCalledOnce());

      // Startup itself must not wait for releases: the idle slot owns them.
      expect(mocks.loadDeferredReleases).not.toHaveBeenCalled();
      expect(requestIdleCallback).toHaveBeenCalledOnce();

      unmount();
      expect(cancelIdleCallback).toHaveBeenCalledWith(1);
      idleCallbacks[0]?.();
      expect(mocks.loadDeferredReleases).not.toHaveBeenCalled();
    } finally {
      idleWindow.requestIdleCallback = originalRequestIdleCallback;
      idleWindow.cancelIdleCallback = originalCancelIdleCallback;
    }
  });

  it('keeps local startup available when backend probing fails', async () => {
    mocks.backend.init.mockRejectedValueOnce(new Error('backend unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderHook(() => useBackendLifecycle(true));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());

    expect(mocks.tryRestoreAuthFromBackend).not.toHaveBeenCalled();
    expect(mocks.syncFromBackend).not.toHaveBeenCalled();
    expect(mocks.startAutoSync).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('stops auto-sync on unmount', async () => {
    const { unmount } = renderHook(() => useBackendLifecycle(true));
    await waitFor(() => expect(mocks.startAutoSync).toHaveBeenCalledOnce());

    unmount();

    expect(mocks.stopAutoSync).toHaveBeenCalledWith(mocks.unsubscribe);
  });
});
