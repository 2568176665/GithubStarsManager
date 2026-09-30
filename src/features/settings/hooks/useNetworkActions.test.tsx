import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RpcDownloadConfig } from '../../../types';

const mocks = vi.hoisted(() => ({
  backend: {
    isAvailable: true,
    backendUrl: 'https://worker.example/api',
    init: vi.fn(),
  },
  testRpcDownload: vi.fn(),
  setRpcDownloadConfig: vi.fn(),
  state: {
    rpcDownloadConfig: { enabled: true, host: 'aria2.example', port: 6800, secret: '' } as RpcDownloadConfig,
  },
}));

vi.mock('../../../services/backendAdapter', () => ({ backend: mocks.backend }));
vi.mock('../../../services/rpcDownloadService', () => ({ testRpcDownload: mocks.testRpcDownload }));
vi.mock('../../../store/useAppStore', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state & { setRpcDownloadConfig: typeof mocks.setRpcDownloadConfig }) => unknown) => selector({ ...mocks.state, setRpcDownloadConfig: mocks.setRpcDownloadConfig }),
    { getState: () => ({ ...mocks.state, setRpcDownloadConfig: mocks.setRpcDownloadConfig }) },
  ),
}));

import { useNetworkActions } from './useNetworkActions';

describe('useNetworkActions RPC 错误提示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.rpcDownloadConfig = { enabled: true, host: 'aria2.example', port: 6800, secret: '' };
    vi.mocked(window.fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ code: 'RPC_PORT_INVALID' }), { status: 400 });
      }
      return new Response(JSON.stringify(mocks.state.rpcDownloadConfig), { status: 200 });
    });
  });

  it('保存配置显示 Worker 返回的具体原因', async () => {
    const { result } = renderHook(() => useNetworkActions({ t: (zh) => zh }));

    await act(async () => {
      await result.current.saveRpc();
    });

    expect(result.current.rpcTestResult).toEqual({ success: false, error: 'RPC 端口必须为 1–65535 的整数' });
  });

  it('启用失败时恢复开关并保留具体错误', async () => {
    mocks.state.rpcDownloadConfig = { enabled: false, host: '', port: 6800, secret: '' };
    vi.mocked(window.fetch).mockResolvedValue(new Response(JSON.stringify({ code: 'RPC_HOST_REQUIRED' }), { status: 400 }));
    const { result } = renderHook(() => useNetworkActions({ t: (zh) => zh }));

    await act(async () => {
      await result.current.toggleRpc(true);
    });

    expect(result.current.rpcForm.enabled).toBe(false);
    expect(result.current.rpcTestResult).toEqual({ success: false, error: '请在设置中填写 RPC 主机地址' });
  });
});
