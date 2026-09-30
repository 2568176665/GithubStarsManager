import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RpcDownloadConfig } from '../types';

const mocks = vi.hoisted(() => ({
  backend: {
    isAvailable: true,
    backendUrl: 'https://worker.example/api',
    init: vi.fn(),
  },
  state: {
    rpcDownloadConfig: { enabled: true, host: 'aria2.example', port: 6800 } as RpcDownloadConfig,
  },
}));

vi.mock('./backendAdapter', () => ({ backend: mocks.backend }));
vi.mock('../store/useAppStore', () => ({ useAppStore: { getState: () => mocks.state } }));

import { sendToRpcDownload, testRpcDownload } from './rpcDownloadService';
import { translateBackendErrorResponse } from '../utils/backendErrors';

const errorResponse = (body: unknown, status = 400) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

describe('RPC Worker 错误解析', () => {
  beforeEach(() => {
    vi.mocked(window.fetch).mockReset();
    localStorage.clear();
    localStorage.setItem('github-stars-manager', JSON.stringify({ state: { language: 'zh' } }));
  });

  it('翻译已知错误码', async () => {
    await expect(translateBackendErrorResponse(errorResponse({ code: 'RPC_PORT_INVALID' }), 'Worker returned 400'))
      .resolves.toBe('RPC 端口必须为 1–65535 的整数');

    localStorage.setItem('github-stars-manager', JSON.stringify({ state: { language: 'en' } }));
    await expect(translateBackendErrorResponse(errorResponse({ code: 'RPC_PORT_INVALID' }), 'Worker returned 400'))
      .resolves.toBe('RPC port must be an integer from 1 to 65535');
  });

  it('未知码、无 code 和非 JSON 均回退原有错误', async () => {
    await expect(translateBackendErrorResponse(errorResponse({ code: 'UNKNOWN_RPC_ERROR' }), 'Server returned 400'))
      .resolves.toBe('Server returned 400');
    await expect(translateBackendErrorResponse(errorResponse({ error: 'bad request' }), 'Worker returned 400'))
      .resolves.toBe('Worker returned 400');
    await expect(translateBackendErrorResponse(new Response('not json', { status: 400 }), 'Server returned 400'))
      .resolves.toBe('Server returned 400');
  });

  it('连接测试显示 Worker 返回的具体原因', async () => {
    vi.mocked(window.fetch).mockResolvedValue(errorResponse({ code: 'RPC_HOST_REQUIRED' }));

    await expect(testRpcDownload({ enabled: true, host: '', port: 6800 }))
      .resolves.toEqual({ success: false, error: '请在设置中填写 RPC 主机地址' });
  });

  it('下载请求显示 Worker 返回的具体原因', async () => {
    vi.mocked(window.fetch).mockResolvedValue(errorResponse({ code: 'RPC_DOWNLOAD_DISABLED' }));

    await expect(sendToRpcDownload('https://example.com/file.zip', 'file.zip'))
      .resolves.toEqual({ success: false, error: '请先在设置中启用远程下载' });
  });

  it('下载请求在响应不可解析时保留状态码回退', async () => {
    vi.mocked(window.fetch).mockResolvedValue(new Response('bad request', { status: 400 }));

    await expect(sendToRpcDownload('https://example.com/file.zip', 'file.zip'))
      .resolves.toEqual({ success: false, error: 'Server returned 400' });
  });
});
