import { describe, expect, it } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { createInitialState } from '../store/initialState';
import {
  APP_STATE_SNAPSHOT_KEYS,
  buildAppStateSnapshot,
  hasAppStateSnapshotChanged,
} from './appStateSnapshot';

describe('appStateSnapshot', () => {
  it('includes all D1-persisted state while excluding GitHub credentials', () => {
    const initial = createInitialState() as unknown as ReturnType<typeof useAppStore.getState>;
    const snapshot = buildAppStateSnapshot({
      ...initial,
      githubToken: 'github-token',
      backendApiSecret: 'backend-secret',
      proxyConfig: { ...initial.proxyConfig, password: 'proxy-password' },
      rpcDownloadConfig: { ...initial.rpcDownloadConfig, secret: 'rpc-secret' },
      mcpConfig: { ...initial.mcpConfig, token: 'mcp-token' },
    });

    for (const key of APP_STATE_SNAPSHOT_KEYS) {
      expect(snapshot).toHaveProperty(key);
    }
    expect(snapshot).not.toHaveProperty('githubToken');
    expect(snapshot).not.toHaveProperty('backendApiSecret');
    expect(snapshot).toMatchObject({
      proxyConfig: expect.objectContaining({ password: 'proxy-password' }),
      rpcDownloadConfig: expect.objectContaining({ secret: 'rpc-secret' }),
      mcpConfig: expect.objectContaining({ token: 'mcp-token' }),
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
});
