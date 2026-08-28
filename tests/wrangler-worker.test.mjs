import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..');
const workerRoot = join(repositoryRoot, 'cloudflare-worker');
const wranglerBinary = join(
  workerRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
);
const useWindowsShell = process.platform === 'win32';

function waitForServer(server) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolvePromise(server.address().port);
    });
  });
}

function getFreePort() {
  const server = createServer();
  return waitForServer(server).then((port) => new Promise((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise(port));
  }));
}

function runWrangler(args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(wranglerBinary, args, {
      cwd,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: useWindowsShell,
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(output);
      else reject(new Error(`wrangler ${args.join(' ')} failed with exit code ${code}\n${output}`));
    });
  });
}

function stopProcess(child) {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null) {
      resolvePromise();
      return;
    }
    child.once('close', resolvePromise);
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  });
}

async function fetchWithRetry(url, init, attempts = 80) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw lastError;
}

async function readResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  return { response, body: await readResponse(response) };
}

function jsonBody(value) {
  return JSON.stringify(value);
}

test('Worker runs all configured features in the Wrangler local environment', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'github-stars-manager-wrangler-'));
  const upstreamRequests = [];
  const upstreamServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    upstreamRequests.push({
      method: request.method,
      path: request.url,
      headers: request.headers,
      body,
    });

    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/jsonrpc' && body?.method === 'aria2.getVersion') {
      response.end(jsonBody({ jsonrpc: '2.0', id: body.id, result: { version: '1.37.0' } }));
      return;
    }
    if (request.url === '/jsonrpc' && body?.method === 'aria2.addUri') {
      response.end(jsonBody({ jsonrpc: '2.0', id: body.id, result: 'test-gid' }));
      return;
    }
    response.end(jsonBody({ choices: [{ message: { content: 'mock-ai-response' } }] }));
  });

  let workerProcess;
  let workerOutput = '';
  try {
    const upstreamPort = await waitForServer(upstreamServer);
    const workerPort = await getFreePort();
    const workerName = `github-stars-manager-test-${process.pid}`;
    const configPath = join(temporaryRoot, 'wrangler.test.json');
    const persistPath = join(temporaryRoot, 'persist');
    const assetsPath = join(temporaryRoot, 'assets');
    await mkdir(assetsPath);
    await writeFile(join(assetsPath, 'index.html'), '<!doctype html><title>Worker test asset</title>');
    const config = {
      name: workerName,
      main: join(workerRoot, 'src', 'index.ts'),
      compatibility_date: '2026-08-20',
      assets: {
        directory: assetsPath,
        not_found_handling: 'single-page-application',
      },
      d1_databases: [{
        binding: 'DB',
        database_name: workerName,
        database_id: 'test-database-id',
        migrations_dir: join(workerRoot, 'migrations'),
      }],
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    await runWrangler([
      'd1', 'migrations', 'apply', workerName,
      '--local', '--persist-to', persistPath, '--config', configPath,
    ], workerRoot);

    workerProcess = spawn(wranglerBinary, [
      'dev', '--local', '--config', configPath,
      '--persist-to', persistPath, '--port', String(workerPort), '--ip', '127.0.0.1',
    ], {
      cwd: workerRoot,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: useWindowsShell,
      windowsHide: true,
    });
    workerProcess.stdout.on('data', (chunk) => { workerOutput += chunk; });
    workerProcess.stderr.on('data', (chunk) => { workerOutput += chunk; });

    const baseUrl = `http://127.0.0.1:${workerPort}`;
    const health = await fetchWithRetry(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await readResponse(health), {
      status: 'ok',
      mode: 'worker-env',
      service: 'github-stars-manager',
    });

    const cors = await request(baseUrl, '/api/health', { method: 'OPTIONS' });
    assert.equal(cors.response.status, 200);
    assert.equal(cors.response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PUT, OPTIONS');

    const initialRepositories = await request(baseUrl, '/api/repositories');
    assert.deepEqual(initialRepositories.body, { repositories: [], total: 0 });
    assert.equal((await request(baseUrl, '/api/repositories', {
      method: 'PUT',
      body: jsonBody({ repositories: [{ id: 1, full_name: 'test/repository' }] }),
    })).response.status, 200);
    assert.deepEqual((await request(baseUrl, '/api/repositories')).body, {
      repositories: [{ id: 1, full_name: 'test/repository' }],
      total: 1,
    });

    for (const collection of ['releases', 'configs/webdav', 'configs/embedding']) {
      const value = collection === 'releases' ? [{ id: 2 }] : { enabled: true, collection };
      const payloadKey = collection === 'releases' ? 'releases' : 'configs';
      assert.equal((await request(baseUrl, `/api/${collection}`, {
        method: 'PUT',
        body: jsonBody({ [payloadKey]: value }),
      })).response.status, 200);
      const result = await request(baseUrl, `/api/${collection}`);
      const expected = collection === 'releases'
        ? { releases: value, total: value.length }
        : value;
      assert.deepEqual(result.body, expected);
    }

    assert.equal((await request(baseUrl, '/api/configs/vector-search', {
      method: 'PUT',
      body: jsonBody({ enabled: true, topK: 10 }),
    })).response.status, 200);
    assert.deepEqual((await request(baseUrl, '/api/configs/vector-search')).body, { enabled: true, topK: 10 });

    assert.equal((await request(baseUrl, '/api/discovery-analyses', {
      method: 'PUT',
      body: jsonBody({ analyses: { 'repo-1': { score: 0.9 } } }),
    })).body.count, 1);
    assert.deepEqual((await request(baseUrl, '/api/discovery-analyses')).body, { 'repo-1': { score: 0.9 } });
    assert.equal((await request(baseUrl, '/api/discovery-analyses', {
      method: 'PUT',
      body: jsonBody({ analyses: [] }),
    })).response.status, 400);

    assert.deepEqual((await request(baseUrl, '/api/settings/rpc-download')).body, {
      enabled: false,
      host: '',
      port: 6800,
      hasSecret: false,
    });
    assert.equal((await request(baseUrl, '/api/settings/rpc-download', {
      method: 'PUT',
      body: jsonBody({ enabled: true, host: '127.0.0.1', port: upstreamPort, secret: 'rpc-secret' }),
    })).body.hasSecret, true);
    assert.equal((await request(baseUrl, '/api/settings/rpc-download', {
      method: 'PUT',
      body: jsonBody({ enabled: true, host: '', port: upstreamPort }),
    })).response.status, 400);
    assert.deepEqual((await request(baseUrl, '/api/settings/rpc-download')).body, {
      enabled: true,
      host: '127.0.0.1',
      port: upstreamPort,
      hasSecret: true,
    });

    const rpcTest = await request(baseUrl, '/api/settings/rpc-download/test', {
      method: 'POST',
      body: jsonBody({ host: '127.0.0.1', port: upstreamPort, secret: 'rpc-secret' }),
    });
    assert.deepEqual(rpcTest.body, { success: true, version: '1.37.0' });
    const rpcDownload = await request(baseUrl, '/api/download/rpc', {
      method: 'POST',
      body: jsonBody({ url: 'https://example.com/archive.zip', filename: 'archive.zip' }),
    });
    assert.deepEqual(rpcDownload.body, { success: true, gid: 'test-gid' });
    assert.deepEqual(upstreamRequests.at(-1).body.params, [
      'token:rpc-secret',
      ['https://example.com/archive.zip'],
      { out: 'archive.zip' },
    ]);

    const settings = {
      theme: 'dark',
      github_token: 'must-not-be-persisted',
      proxyConfig: { enabled: true },
    };
    assert.equal((await request(baseUrl, '/api/settings', {
      method: 'PUT',
      body: jsonBody(settings),
    })).response.status, 200);
    const storedSettings = (await request(baseUrl, '/api/settings')).body;
    assert.deepEqual(storedSettings, { theme: 'dark', proxyConfig: { enabled: true } });
    assert.equal('github_token' in storedSettings, false);

    const aiConfig = {
      id: 'ai-1',
      apiType: 'openai-compatible',
      baseUrl: `http://127.0.0.1:${upstreamPort}/compatible`,
      apiKey: 'ai-secret',
      model: 'mock-model',
      reasoningEffort: 'minimal',
    };
    const aiBulk = await request(baseUrl, '/api/configs/ai/bulk', {
      method: 'PUT',
      body: jsonBody({ configs: [aiConfig] }),
    });
    assert.deepEqual(aiBulk.body, { synced: 1, skipped: 0, errors: [] });
    assert.deepEqual((await request(baseUrl, '/api/configs/ai')).body, [aiConfig]);
    const aiProxy = await request(baseUrl, '/api/proxy/ai', {
      method: 'POST',
      body: jsonBody({ configId: 'ai-1', body: { messages: [{ role: 'user', content: 'hello' }] } }),
    });
    assert.equal(aiProxy.response.status, 200);
    assert.deepEqual(aiProxy.body, { choices: [{ message: { content: 'mock-ai-response' } }] });
    const aiRequest = upstreamRequests.find((entry) => entry.path === '/compatible');
    assert.equal(aiRequest.headers.authorization, 'Bearer ai-secret');
    assert.deepEqual(aiRequest.body, {
      messages: [{ role: 'user', content: 'hello' }],
      model: 'mock-model',
      reasoning: { effort: 'low' },
    });
    assert.equal((await request(baseUrl, '/api/proxy/ai', {
      method: 'POST',
      body: jsonBody({ configId: 'missing' }),
    })).response.status, 404);
    assert.equal((await request(baseUrl, '/api/proxy/ai', {
      method: 'POST',
      body: jsonBody({}),
    })).response.status, 400);

    const aiVariants = [
      {
        apiType: 'openai',
        path: '/openai/v1/chat/completions',
        headers: { authorization: 'Bearer variant-key' },
      },
      {
        apiType: 'openai-responses',
        path: '/openai-responses/v1/responses',
        headers: { authorization: 'Bearer variant-key' },
      },
      {
        apiType: 'claude',
        path: '/claude/v1/messages',
        headers: { 'x-api-key': 'variant-key', 'anthropic-version': '2023-06-01' },
      },
      {
        apiType: 'gemini',
        path: '/gemini/v1beta/models/gemini-model:generateContent?key=variant-key',
        headers: {},
      },
      {
        apiType: 'deepseek',
        path: '/deepseek/v1/chat/completions',
        headers: { authorization: 'Bearer variant-key' },
      },
      {
        apiType: 'mimo',
        path: '/mimo/v1/chat/completions',
        headers: { authorization: 'Bearer variant-key' },
      },
    ];
    for (const variant of aiVariants) {
      const variantResponse = await request(baseUrl, '/api/proxy/ai', {
        method: 'POST',
        body: jsonBody({
          config: {
            apiType: variant.apiType,
            baseUrl: `http://127.0.0.1:${upstreamPort}/${variant.apiType}`,
            apiKey: 'variant-key',
            model: 'gemini-model',
          },
          body: { input: 'hello' },
        }),
      });
      assert.equal(variantResponse.response.status, 200);
      const variantRequest = upstreamRequests.at(-1);
      assert.equal(variantRequest.path, variant.path);
      for (const [header, value] of Object.entries(variant.headers)) {
        assert.equal(variantRequest.headers[header], value);
      }
      assert.equal(variantRequest.body.model, 'gemini-model');
    }

    assert.equal((await request(baseUrl, '/api/session')).response.status, 503);
    assert.equal((await request(baseUrl, '/api/proxy/github/graphql', {
      method: 'POST',
      body: jsonBody({ method: 'POST', body: { query: '{ viewer { login } }' } }),
    })).response.status, 503);

    const favicon = await fetch(`${baseUrl}/favicon.ico`, { redirect: 'manual' });
    assert.equal(favicon.status, 302);
    assert.equal(favicon.headers.get('location'), `${baseUrl}/icon.png`);
    const asset = await fetch(`${baseUrl}/`);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /Worker test asset/);
    const assetFile = await fetch(`${baseUrl}/index.html`);
    assert.equal(assetFile.status, 200);
    assert.match(await assetFile.text(), /Worker test asset/);
  } catch (error) {
    if (workerOutput) error.message += `\nWrangler output:\n${workerOutput}`;
    throw error;
  } finally {
    if (workerProcess) await stopProcess(workerProcess);
    await new Promise((resolvePromise) => upstreamServer.close(resolvePromise));
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
