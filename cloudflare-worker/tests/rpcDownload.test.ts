import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const createD1Mock = (initial?: unknown) => {
  let value: string | null = initial === undefined ? null : JSON.stringify(initial);

  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async <T>() => (sql.startsWith('SELECT') && value ? { value } : null) as T | null,
        run: async () => {
          value = String(args[1]);
          return { success: true };
        },
      }),
    }),
  } as never;
};

const request = (path: string, method: string, body: unknown) => new Request(`https://gsm.example/api/${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const responseBody = async (response: Response) => await response.json() as Record<string, unknown>;

describe('Worker RPC download validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns stable codes for RPC settings validation failures', async () => {
    const env = { DB: createD1Mock() } as never;

    const missingHost = await worker.fetch(request('settings/rpc-download', 'PUT', { enabled: true, port: 6800 }), env);
    expect(missingHost.status).toBe(400);
    expect(await responseBody(missingHost)).toMatchObject({ error: 'valid RPC host and port required', code: 'RPC_HOST_REQUIRED' });

    const invalidPort = await worker.fetch(request('settings/rpc-download', 'PUT', { enabled: true, host: 'aria2', port: 65536 }), env);
    expect(invalidPort.status).toBe(400);
    expect(await responseBody(invalidPort)).toMatchObject({ error: 'valid RPC host and port required', code: 'RPC_PORT_INVALID' });

    const fractionalPort = await worker.fetch(request('settings/rpc-download', 'PUT', { enabled: true, host: 'aria2', port: 6800.5 }), env);
    expect(fractionalPort.status).toBe(400);
    expect(await responseBody(fractionalPort)).toMatchObject({ code: 'RPC_PORT_INVALID' });

    for (const port of [1, 65535]) {
      const boundaryPort = await worker.fetch(request('settings/rpc-download', 'PUT', { enabled: true, host: 'aria2', port }), env);
      expect(boundaryPort.status).toBe(200);
    }
  });

  it('returns stable codes for RPC connection test validation failures', async () => {
    const env = {} as never;

    const missingHost = await worker.fetch(request('settings/rpc-download/test', 'POST', { port: 6800 }), env);
    expect(missingHost.status).toBe(400);
    expect(await responseBody(missingHost)).toMatchObject({ success: false, code: 'RPC_HOST_REQUIRED' });

    const invalidPort = await worker.fetch(request('settings/rpc-download/test', 'POST', { host: 'aria2', port: 0 }), env);
    expect(invalidPort.status).toBe(400);
    expect(await responseBody(invalidPort)).toMatchObject({ success: false, code: 'RPC_PORT_INVALID' });
  });

  it('returns stable codes for disabled and incomplete RPC downloads', async () => {
    const env = { DB: createD1Mock() } as never;

    const disabled = await worker.fetch(request('download/rpc', 'POST', { url: 'https://example.com/file.zip' }), env);
    expect(disabled.status).toBe(400);
    expect(await responseBody(disabled)).toMatchObject({ success: false, code: 'RPC_DOWNLOAD_DISABLED' });

    await worker.fetch(request('settings/rpc-download', 'PUT', { enabled: true, host: 'aria2', port: 6800 }), env);
    const emptyUrl = await worker.fetch(request('download/rpc', 'POST', { url: '  ' }), env);
    expect(emptyUrl.status).toBe(400);
    expect(await responseBody(emptyUrl)).toMatchObject({ success: false, code: 'RPC_DOWNLOAD_URL_REQUIRED' });
  });

  it('returns host and port validation codes for persisted RPC download settings', async () => {
    const missingHostEnv = { DB: createD1Mock({ enabled: true, host: '', port: 6800 }) } as never;
    const missingHost = await worker.fetch(request('download/rpc', 'POST', { url: 'https://example.com/file.zip' }), missingHostEnv);
    expect(missingHost.status).toBe(400);
    expect(await responseBody(missingHost)).toMatchObject({ code: 'RPC_HOST_REQUIRED' });

    const invalidPortEnv = { DB: createD1Mock({ enabled: true, host: 'aria2', port: 65536 }) } as never;
    const invalidPort = await worker.fetch(request('download/rpc', 'POST', { url: 'https://example.com/file.zip' }), invalidPortEnv);
    expect(invalidPort.status).toBe(400);
    expect(await responseBody(invalidPort)).toMatchObject({ code: 'RPC_PORT_INVALID' });
  });

  it('proxies a valid download to aria2', async () => {
    const env = { DB: createD1Mock() } as never;
    await worker.fetch(request('settings/rpc-download', 'PUT', { enabled: true, host: 'aria2.example', port: '6800', secret: 'secret' }), env);
    const upstreamFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 'gid-1' }), { status: 200 }));
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await worker.fetch(request('download/rpc', 'POST', {
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
    }), env);

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({ success: true, gid: 'gid-1' });
    expect(upstreamFetch).toHaveBeenCalledWith('http://aria2.example:6800/jsonrpc', expect.objectContaining({
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'github-stars-manager',
        method: 'aria2.addUri',
        params: ['token:secret', ['https://example.com/file.zip'], { out: 'file.zip' }],
      }),
    }));
  });

  it('returns 502 when aria2 returns an upstream HTTP error', async () => {
    const env = { DB: createD1Mock() } as never;
    await worker.fetch(request('settings/rpc-download', 'PUT', { enabled: true, host: 'aria2.example', port: 6800 }), env);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 503 })));

    const response = await worker.fetch(request('download/rpc', 'POST', { url: 'https://example.com/file.zip' }), env);

    expect(response.status).toBe(502);
    expect(await responseBody(response)).toEqual({ success: false, error: 'aria2 returned HTTP 503' });
  });
});
