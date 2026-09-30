import { describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { createInitialState } from '../store/initialState';
import {
  APP_STATE_SNAPSHOT_KEYS,
  applyAppStateSnapshot,
  buildAppStateSnapshot,
  hasAppStateSnapshotChanged,
} from './appStateSnapshot';

describe('appStateSnapshot', () => {
  it('includes all D1-persisted state while excluding GitHub credentials', () => {
    const initial = createInitialState() as unknown as ReturnType<typeof useAppStore.getState>;
    const snapshot = buildAppStateSnapshot({
      ...initial,
      githubToken: 'github-token',
      rpcDownloadConfig: { ...initial.rpcDownloadConfig, secret: 'rpc-secret' },
    });

    for (const key of APP_STATE_SNAPSHOT_KEYS) {
      expect(snapshot).toHaveProperty(key);
    }
    expect(snapshot).not.toHaveProperty('githubToken');
    expect(snapshot).toMatchObject({
      rpcDownloadConfig: expect.objectContaining({ secret: 'rpc-secret' }),
    });
  });

  it('detects changes to any D1-persisted field but ignores token-only changes', () => {
    const initial = createInitialState() as unknown as ReturnType<typeof useAppStore.getState>;
    const changedTheme = {
      ...initial,
      theme: (initial.theme === 'dark' ? 'light' : 'dark') as 'light' | 'dark',
    };
    const changedToken = { ...initial, githubToken: 'github-token' };

    expect(hasAppStateSnapshotChanged(changedTheme, initial)).toBe(true);
    expect(hasAppStateSnapshotChanged(changedToken, initial)).toBe(false);
  });

  it('preserves local asset filters when restoring a pre-filter D1 snapshot', () => {
    const store = useAppStore as unknown as {
      getState?: () => { githubToken: string | null };
      setState?: (state: Record<string, unknown>) => void;
    };
    const originalGetState = store.getState;
    const originalSetState = store.setState;
    const setState = vi.fn();
    store.getState = () => ({ githubToken: null });
    store.setState = setState;

    try {
      applyAppStateSnapshot({ theme: 'dark' });
      expect(setState).toHaveBeenCalledWith(expect.not.objectContaining({ assetFilters: expect.anything() }));

      setState.mockClear();
      applyAppStateSnapshot({ assetFilters: [{ id: 'filter', name: 'Filter', keywords: [' MSI '], excludeRepos: ['old/repo'] }] });
      expect(setState).toHaveBeenCalledWith(expect.objectContaining({
        assetFilters: [{ id: 'filter', name: 'Filter', keywords: ['MSI'] }],
      }));
    } finally {
      if (originalGetState) store.getState = originalGetState;
      else delete store.getState;
      if (originalSetState) store.setState = originalSetState;
      else delete store.setState;
    }
  });
});
