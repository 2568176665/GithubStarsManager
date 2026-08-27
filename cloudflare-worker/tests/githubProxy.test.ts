import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const createD1Mock = () => {
  let value: string | null = null;

  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async <T>() => {
          if (sql.startsWith('SELECT')) return (value ? { value } : null) as T | null;
          return null;
        },
        run: async () => {
          value = String(args[1]);
          return { success: true };
        },
      }),
    }),
  } as never;
};

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

  it('persists AI configs in D1 and reads them back without AI environment variables', async () => {
    const env = { DB: createD1Mock() } as never;
    const config = {
      id: 'ai-1',
      name: 'D1 AI',
      apiType: 'openai-compatible',
      baseUrl: 'https://ai.example/v1/chat/completions',
      apiKey: 'd1-secret',
      model: 'd1-model',
      isActive: true,
    };

    const saveResponse = await worker.fetch(
      new Request('https://gsm.example/api/configs/ai/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: [config] }),
      }),
      env
    );
    expect(saveResponse.status).toBe(200);

    const readResponse = await worker.fetch(
      new Request('https://gsm.example/api/configs/ai'),
      env
    );
    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toEqual([config]);
  });

  it('proxies AI requests using the persisted D1 config', async () => {
    const env = { DB: createD1Mock() } as never;
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', upstreamFetch);

    await worker.fetch(
      new Request('https://gsm.example/api/configs/ai/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: [{
            id: 'ai-1',
            name: 'D1 AI',
            apiType: 'openai-compatible',
            baseUrl: 'https://ai.example/v1/chat/completions',
            apiKey: 'd1-secret',
            model: 'd1-model',
            isActive: true,
          }],
        }),
      }),
      env
    );

    const response = await worker.fetch(
      new Request('https://gsm.example/api/proxy/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: 'ai-1', body: { messages: [{ role: 'user', content: 'hello' }] } }),
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledWith(
      'https://ai.example/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer d1-secret' }),
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], model: 'd1-model' }),
      })
    );
  });

  it('persists the complete settings snapshot in D1 without the GitHub token', async () => {
    const env = { DB: createD1Mock() } as never;

    const response = await worker.fetch(
      new Request('https://gsm.example/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          github_token: 'must-not-be-stored',
          theme: 'dark',
          discoveryRepos: { trending: [{ id: 1 }] },
          proxyConfig: { enabled: true, password: 'proxy-secret' },
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);

    const persisted = await worker.fetch(
      new Request('https://gsm.example/api/settings'),
      env,
    );
    const settings = await persisted.json() as Record<string, unknown>;

    expect(settings).toEqual({
      theme: 'dark',
      discoveryRepos: { trending: [{ id: 1 }] },
      proxyConfig: { enabled: true, password: 'proxy-secret' },
    });
    expect(settings).not.toHaveProperty('github_token');
  });
});
