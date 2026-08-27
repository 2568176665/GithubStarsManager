interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  VECTORIZE?: Vectorize;
  AUTH_TOKEN?: string;
  GITHUB_TOKEN?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS_HEADERS });

async function readState(env: Env, key: string, fallback: unknown): Promise<unknown> {
  const row = await env.DB.prepare('SELECT value FROM sync_state WHERE key = ?').bind(key).first<{ value: string }>();
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

async function writeState(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare('INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(key, JSON.stringify(value), Date.now()).run();
}

/** GitHub credentials are browser/session data and must never enter Worker D1. */
function withoutGitHubToken(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'github_token' && key !== 'github_token_status'),
  );
}

async function readSettings(env: Env): Promise<Record<string, unknown>> {
  const stored = await readState(env, 'settings', {});
  const sanitized = withoutGitHubToken(stored);
  // Also clean up settings written by older Worker versions that accepted the
  // token field, so the credential is removed from D1 at the next read.
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const storedKeys = Object.keys(stored as Record<string, unknown>);
    if (storedKeys.length !== Object.keys(sanitized).length) {
      await writeState(env, 'settings', sanitized);
    }
  }
  return sanitized;
}

type AIConfig = {
  id?: unknown;
  apiType?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
  [key: string]: unknown;
};

function buildApiUrl(baseUrl: string, pathWithVersion: string): string {
  const baseUrlWithSlash = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const versionPrefix = pathWithVersion.split('/')[0] || '';

  try {
    const base = new URL(baseUrlWithSlash);
    const basePath = base.pathname.replace(/\/$/, '');
    const hasVersionInBase = /\/v\d+(?:beta|alpha)?$/.test(basePath);

    if (hasVersionInBase) {
      const endpointPath = pathWithVersion.includes('/') ? pathWithVersion.split('/').slice(1).join('/') : pathWithVersion;
      return new URL(endpointPath, baseUrlWithSlash).toString();
    }
    if (versionPrefix && new RegExp(`/${versionPrefix}$`).test(basePath) && pathWithVersion.startsWith(`${versionPrefix}/`)) {
      return new URL(pathWithVersion.slice(versionPrefix.length + 1), baseUrlWithSlash).toString();
    }
    return new URL(pathWithVersion, baseUrlWithSlash).toString();
  } catch {
    return `${baseUrlWithSlash}${pathWithVersion}`;
  }
}

function normalizeReasoningEffort(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value === 'minimal' ? 'low' : value;
}

async function getAIConfigs(env: Env): Promise<AIConfig[]> {
  const configs = await readState(env, 'configs/ai', []);
  return Array.isArray(configs) ? configs as AIConfig[] : [];
}

async function saveAIConfigs(env: Env, configs: AIConfig[]): Promise<void> {
  await writeState(env, 'configs/ai', configs);
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return json({ status: 'ok', mode: 'worker-env', service: 'github-stars-manager' });
  if (url.pathname === '/api/session' && request.method === 'GET') {
    if (!env.GITHUB_TOKEN) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'github-stars-manager-worker' },
    });
    return new Response(response.body, { status: response.status, headers: CORS_HEADERS });
  }
  if (url.pathname.startsWith('/api/proxy/github/') && request.method === 'POST') {
    if (!env.GITHUB_TOKEN) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);
    const endpoint = url.pathname.replace('/api/proxy/github', '') + url.search;
    const payload = await request.json() as { method?: string; headers?: Record<string, string>; body?: unknown };
    const requestBody = payload.body == null
      ? undefined
      : typeof payload.body === 'string'
        ? payload.body
        : JSON.stringify(payload.body);
    const response = await fetch(`https://api.github.com${endpoint}`, {
      method: payload.method || 'GET',
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'github-stars-manager-worker', ...(payload.headers || {}) },
      body: requestBody,
    });
    return new Response(response.body, { status: response.status, headers: { ...CORS_HEADERS, 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });
  }
  if (url.pathname === '/api/proxy/ai' && request.method === 'POST') {
    const payload = await request.json() as { configId?: unknown; config?: AIConfig; body?: Record<string, unknown> };
    const configId = typeof payload.configId === 'string' ? payload.configId : '';
    const configs = configId ? await getAIConfigs(env) : [];
    const storedConfig = configId ? configs.find((config) => config.id === configId) : undefined;

    if (configId && !storedConfig) return json({ error: 'AI config not found', code: 'AI_CONFIG_NOT_FOUND' }, 404);
    const config = storedConfig || payload.config;
    if (!config) return json({ error: 'configId or config required', code: 'CONFIG_ID_REQUIRED' }, 400);

    const apiKey = typeof config.apiKey === 'string' ? config.apiKey : '';
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : '';
    const model = typeof config.model === 'string' ? config.model : '';
    const apiType = typeof config.apiType === 'string' ? config.apiType : 'openai';
    if (!baseUrl || !apiKey || !model) return json({ error: 'baseUrl, apiKey, and model are required', code: 'INVALID_REQUEST' }, 400);

    let endpoint: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (apiType === 'claude') {
      endpoint = buildApiUrl(baseUrl, 'v1/messages');
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (apiType === 'gemini') {
      const modelName = model.trim().replace(/^models\//, '');
      const endpointUrl = new URL(buildApiUrl(baseUrl, `v1beta/models/${encodeURIComponent(modelName)}:generateContent`));
      endpointUrl.searchParams.set('key', apiKey);
      endpoint = endpointUrl.toString();
    } else {
      endpoint = apiType === 'openai-compatible'
        ? baseUrl.replace(/\/+$/, '')
        : buildApiUrl(baseUrl, apiType === 'openai-responses' ? 'v1/responses' : 'v1/chat/completions');
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const requestBody = { ...(payload.body || {}), model };
    const reasoningEffort = normalizeReasoningEffort(config.reasoningEffort);
    const supportsReasoning = ['openai', 'openai-responses', 'openai-compatible', 'deepseek', 'mimo'].includes(apiType);
    const effectiveBody = reasoningEffort && model.trim() !== 'deepseek-reasoner' && supportsReasoning && !('reasoning' in requestBody)
      ? { ...requestBody, reasoning: { effort: reasoningEffort } }
      : requestBody;
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(effectiveBody) });
    return new Response(response.body, { status: response.status, headers: { ...CORS_HEADERS, 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });
  }
  const path = url.pathname.replace(/^\/api\//, '');
  if (path === 'configs/ai' && request.method === 'GET') return json(await getAIConfigs(env));
  if (path === 'configs/ai/bulk' && request.method === 'PUT') {
    const body = await request.json() as { configs?: AIConfig[] };
    if (!Array.isArray(body.configs)) return json({ error: 'configs array required' }, 400);
    await saveAIConfigs(env, body.configs);
    return json({ synced: body.configs.length, skipped: 0, errors: [] });
  }

  const collection = path.match(/^(repositories|releases|configs\/(?:webdav|embedding))(?:\/bulk)?$/)?.[1];
  if (collection && request.method === 'GET') {
    const value = await readState(env, collection, []);
    return collection === 'repositories' || collection === 'releases'
      ? json({ [collection]: value, total: Array.isArray(value) ? value.length : 0 }) : json(value);
  }
  if (collection && request.method === 'PUT') {
    const body = await request.json() as Record<string, unknown>;
    await writeState(env, collection, body[collection] ?? body.configs ?? []);
    return json({ success: true });
  }
  if (path === 'configs/vector-search' && request.method === 'GET') return json(await readState(env, path, {}));
  if (path === 'configs/vector-search' && request.method === 'PUT') { await writeState(env, path, await request.json()); return json({ success: true }); }
  if (path === 'discovery-analyses' && request.method === 'GET') return json(await readState(env, path, {}));
  if (path === 'discovery-analyses' && request.method === 'PUT') {
    const body = await request.json() as { analyses?: Record<string, unknown> };
    if (!body.analyses || typeof body.analyses !== 'object' || Array.isArray(body.analyses)) {
      return json({ error: 'analyses object required' }, 400);
    }
    await writeState(env, path, body.analyses);
    return json({ success: true, count: Object.keys(body.analyses).length });
  }
  if (path === 'settings/rpc-download' && request.method === 'GET') {
    const config = await readState(env, path, {}) as Record<string, unknown>;
    return json({
      enabled: config.enabled === true,
      host: typeof config.host === 'string' ? config.host : '',
      port: typeof config.port === 'number' ? config.port : 6800,
      hasSecret: typeof config.secret === 'string' && config.secret.length > 0,
    });
  }
  if (path === 'settings/rpc-download' && request.method === 'PUT') {
    const body = await request.json() as Record<string, unknown>;
    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const port = typeof body.port === 'number' ? body.port : Number(body.port);
    if ((body.enabled === true && !host) || !Number.isInteger(port) || port < 1 || port > 65535) {
      return json({ error: 'valid RPC host and port required' }, 400);
    }
    const previous = await readState(env, path, {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { enabled: body.enabled === true, host, port };
    if (typeof body.secret === 'string' && body.secret.length > 0) next.secret = body.secret;
    else if (typeof previous.secret === 'string' && previous.secret.length > 0) next.secret = previous.secret;
    await writeState(env, path, next);
    return json({ success: true, hasSecret: typeof next.secret === 'string' && next.secret.length > 0 });
  }
  if (path === 'settings/rpc-download/test' && request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const port = typeof body.port === 'number' ? body.port : Number(body.port);
    const secret = typeof body.secret === 'string' ? body.secret : '';
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return json({ success: false, error: 'valid RPC host and port required' }, 400);
    const params = secret ? [`token:${secret}`] : [];
    try {
      const response = await fetch(`http://${host}:${port}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'github-stars-manager', method: 'aria2.getVersion', params }),
      });
      if (!response.ok) return json({ success: false, error: `aria2 returned HTTP ${response.status}` }, 502);
      const result = await response.json() as { error?: { message?: string }; result?: { version?: string } };
      if (result.error) return json({ success: false, error: result.error.message || 'RPC error' }, 502);
      return json({ success: true, version: result.result?.version });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 502);
    }
  }
  if (path === 'download/rpc' && request.method === 'POST') {
    const body = await request.json() as { url?: string; filename?: string };
    const config = await readState(env, 'settings/rpc-download', {}) as Record<string, unknown>;
    const host = typeof config.host === 'string' ? config.host.trim() : '';
    const port = typeof config.port === 'number' ? config.port : Number(config.port);
    if (config.enabled !== true || !host || !body.url || !Number.isInteger(port)) return json({ success: false, error: 'RPC download not configured' }, 400);
    const params: unknown[] = typeof config.secret === 'string' && config.secret ? [`token:${config.secret}`, [body.url]] : [[body.url]];
    if (body.filename) params.push({ out: body.filename });
    try {
      const response = await fetch(`http://${host}:${port}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'github-stars-manager', method: 'aria2.addUri', params }),
      });
      if (!response.ok) return json({ success: false, error: `aria2 returned HTTP ${response.status}` }, 502);
      const result = await response.json() as { error?: { message?: string }; result?: string };
      if (result.error) return json({ success: false, error: result.error.message || 'RPC error' }, 502);
      return json({ success: true, gid: result.result });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 502);
    }
  }
  if (path === 'settings' && request.method === 'GET') return json(await readSettings(env));
  if (path === 'settings' && request.method === 'PUT') {
    await writeState(env, path, withoutGitHubToken(await request.json()));
    return json({ success: true });
  }
  return json({ error: 'Not Found' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env);
      // Browsers may request the conventional favicon path even though the
      // Vite document points to /icon.png. Redirect it to the shipped asset so
      // a missing optional file cannot enter the asset fallback path.
      if (url.pathname === '/favicon.ico') {
        return Response.redirect(new URL('/icon.png', request.url).toString(), 302);
      }
      if (!env.ASSETS) {
        return new Response('Not Found', {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
    }
  },
};
