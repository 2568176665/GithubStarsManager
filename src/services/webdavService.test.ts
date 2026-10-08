import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebDAVService } from './webdavService';

const config = {
  id: 'dav-test', name: 'DAV', url: 'https://dav.example',
  path: '/Backup', username: 'user', password: 'password', isActive: true,
};
const multistatus = (href: string, status: number, propertiesOnly = false) => new Response(
  `<d:multistatus xmlns:d="DAV:"><d:response><d:href>${href}</d:href>${propertiesOnly ? '<d:propstat>' : ''}<d:status>HTTP/1.1 ${status} Status</d:status>${propertiesOnly ? '</d:propstat>' : ''}</d:response></d:multistatus>`,
  { status: 207 },
);

const pendingUntilAbort = (_url: unknown, options?: RequestInit): Promise<Response> => new Promise((_, reject) => {
  options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
});

describe('WebDAV probes', () => {
  beforeEach(() => {
    vi.mocked(window.fetch).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses PROPFIND first without a redundant HEAD request', async () => {
    vi.mocked(window.fetch).mockResolvedValue(multistatus('/Backup/', 200));
    expect(await new WebDAVService(config).testConnection()).toBe(true);
    expect(window.fetch).toHaveBeenCalledTimes(1);
    expect(window.fetch).toHaveBeenCalledWith('https://dav.example/Backup', expect.objectContaining({
      method: 'PROPFIND', headers: expect.objectContaining({ Depth: '0' }),
    }));
  });

  it.each(['http', 'network'])('falls back to HEAD after a PROPFIND %s failure', async (failure) => {
    const fetch = vi.mocked(window.fetch);
    if (failure === 'http') fetch.mockResolvedValueOnce(new Response(null, { status: 405 }));
    else fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await new WebDAVService(config).testConnection()).toBe(true);
    expect(fetch.mock.calls.map((call) => call[1]?.method)).toEqual(['PROPFIND', 'HEAD']);
    expect(fetch.mock.calls[1][1]?.signal).toBe(fetch.mock.calls[0][1]?.signal);
  });

  it.each([
    ['/Backup', 404, false, false],
    ['https://dav.example/%42ackup/', 200, false, true],
    ['/Backup', 404, true, true],
    ['/backup', 404, false, true],
    ['/old/Backup', 404, false, true],
  ])('checks resource status for %s (%i), preserving path case and property status', async (href, status, propertiesOnly, expected) => {
    vi.mocked(window.fetch).mockResolvedValue(multistatus(href, status, propertiesOnly));
    expect(await new WebDAVService(config).testConnection()).toBe(expected);
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps one timeout budget across PROPFIND and HEAD', async () => {
    vi.useFakeTimers();
    vi.mocked(window.fetch).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 9000));
      return new Response(null, { status: 405 });
    }).mockImplementationOnce(pendingUntilAbort);
    const result = new WebDAVService(config).testConnection();
    const assertion = expect(result).rejects.toThrow('连接超时');
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry HEAD after PROPFIND times out', async () => {
    vi.useFakeTimers();
    vi.mocked(window.fetch).mockImplementation(pendingUntilAbort);
    const result = new WebDAVService(config).testConnection();
    const assertion = expect(result).rejects.toThrow('连接超时');
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(window.fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 404])('uses PROPFIND resource status after HEAD 403 for files (%i)', async (status) => {
    vi.mocked(window.fetch).mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(multistatus('/Backup/data.json', status));
    expect(await new WebDAVService(config).fileExists('data.json')).toBe(status === 200);
    expect(vi.mocked(window.fetch).mock.calls.map((call) => call[1]?.method)).toEqual(['HEAD', 'PROPFIND']);
  });

  it('does not fall back for a missing HEAD resource', async () => {
    vi.mocked(window.fetch).mockResolvedValue(new Response(null, { status: 404 }));
    expect(await new WebDAVService(config).fileExists('missing.json')).toBe(false);
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });

  it('clears the timer after file probe failure', async () => {
    vi.useFakeTimers();
    vi.mocked(window.fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await new WebDAVService(config).fileExists('data.json')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps one timeout budget across HEAD and PROPFIND for files', async () => {
    vi.useFakeTimers();
    vi.mocked(window.fetch).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 9000));
      return new Response(null, { status: 403 });
    }).mockImplementationOnce(pendingUntilAbort);
    const result = new WebDAVService(config).fileExists('data.json');
    await vi.advanceTimersByTimeAsync(10000);
    expect(await result).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
