import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMcpActions } from './useMcpActions';

const backendMock = vi.hoisted(() => ({
  isAvailable: true,
  isWorkerEnvMode: true,
  getMcpStatus: vi.fn(),
  updateMcpConfig: vi.fn(),
}));

const storeMock = vi.hoisted(() => ({
  mcpConfig: { enabled: false, token: '', host: '127.0.0.1', port: 3927 },
  setMcpConfig: vi.fn(),
}));

vi.mock('../../../services/backendAdapter', () => ({ backend: backendMock }));
vi.mock('../../../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof storeMock) => unknown) => selector(storeMock),
}));
vi.mock('../../../hooks/useDialog', () => ({
  useDialog: () => ({ toast: vi.fn(), confirm: vi.fn() }),
}));
vi.mock('../../../services/electronProxy', () => ({ isElectron: () => false }));

describe('useMcpActions', () => {
  it('does not query unsupported MCP admin APIs in Worker mode', async () => {
    const { result } = renderHook(() => useMcpActions({ t: (_zh, en) => en }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.backendMode).toBe(false);
    expect(backendMock.getMcpStatus).not.toHaveBeenCalled();
  });
});
