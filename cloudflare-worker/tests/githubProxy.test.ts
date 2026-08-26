import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

describe('Cloudflare Worker GitHub proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes an object GraphQL body before forwarding it upstream', async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { viewer: { login: 'test' } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', upstreamFetch);

    const graphQLBody = { query: 'query { viewer { login } }', variables: {} };
    const response = await worker.fetch(
      new Request('https://gsm.example/api/proxy/github/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: graphQLBody }),
      }),
      { GITHUB_TOKEN: 'worker-token' } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(upstreamFetch).toHaveBeenCalledWith(
      'https://api.github.com/graphql',
      expect.objectContaining({ body: JSON.stringify(graphQLBody) })
    );
  });

  it('returns 404 instead of 500 when a static asset binding is unavailable', async () => {
    const response = await worker.fetch(
      new Request('https://gsm.example/icon-rounded-light.svg'),
      {} as never
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
  });
});
