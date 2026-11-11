import { describe, expect, it } from 'vitest';
import worker from '../src/index';

/**
 * The repositories GET response is projected down to the fields the app reads,
 * and PUT restores everything outside that projection from the stored row. Both
 * halves are needed: without the restore, a client that only ever saw the
 * projected payload would erase those fields from D1 on its next write-back.
 */
const REPOSITORY_ROW = {
  id: 42,
  node_id: 'R_kgDOTest',
  name: 'demo',
  full_name: 'owner/demo',
  private: false,
  owner: {
    login: 'owner',
    id: 7,
    node_id: 'MDQ6VXNlcjc=',
    avatar_url: 'https://avatars.githubusercontent.com/u/7?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/owner',
    html_url: 'https://github.com/owner',
    type: 'User',
    site_admin: false,
  },
  html_url: 'https://github.com/owner/demo',
  description: 'a demo repository',
  fork: false,
  url: 'https://api.github.com/repos/owner/demo',
  forks_url: 'https://api.github.com/repos/owner/demo/forks',
  collaborators_url: 'https://api.github.com/repos/owner/demo/collaborators{/collaborator}',
  clone_url: 'https://github.com/owner/demo.git',
  ssh_url: 'git@github.com:owner/demo.git',
  homepage: 'https://example.com',
  size: 1234,
  stargazers_count: 99,
  watchers_count: 99,
  forks_count: 3,
  forks: 3,
  open_issues_count: 5,
  language: 'TypeScript',
  has_issues: true,
  has_wiki: true,
  visibility: 'public',
  archived: false,
  disabled: false,
  is_template: false,
  default_branch: 'main',
  topics: ['demo', 'tools'],
  license: 'MIT',
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  pushed_at: '2024-01-02T00:00:00Z',
  starred_at: '2024-02-01T00:00:00Z',
  ai_summary: 'demo summary',
  custom_tags: ['mine'],
};

const SERVED_FIELDS = [
  'ai_summary', 'archived', 'created_at', 'custom_tags', 'default_branch',
  'description', 'disabled', 'fork', 'forks', 'forks_count', 'full_name',
  'html_url', 'id', 'is_template', 'language', 'license', 'name',
  'open_issues_count', 'owner', 'pushed_at', 'stargazers_count', 'starred_at',
  'topics', 'updated_at',
].sort();

const createD1Mock = () => {
  const rows = new Map<string, string>();
  const db = {
    prepare: (sql: string) => ({
      all: async () => ({ results: [] }),
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (!sql.startsWith('SELECT')) return null;
          const stored = rows.get(String(args[0]));
          return stored === undefined ? null : { value: stored };
        },
        run: async () => {
          rows.set(String(args[0]), String(args[1]));
          return { success: true };
        },
        all: async () => ({ results: [] }),
      }),
    }),
    batch: async () => [],
  } as never;
  return { db, rows, storedRepositories: () => JSON.parse(rows.get('repositories') ?? '[]') as Record<string, unknown>[] };
};

const env = (mock: ReturnType<typeof createD1Mock>) => ({ DB: mock.db } as never);
const ctx = { waitUntil: () => {} } as never;

const put = (mock: ReturnType<typeof createD1Mock>, repositories: unknown[]) => worker.fetch(
  new Request('https://gsm.example/api/repositories', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositories, isFullSync: true }),
  }),
  env(mock),
  ctx,
);

const get = (mock: ReturnType<typeof createD1Mock>, headers?: Record<string, string>) => worker.fetch(
  new Request('https://gsm.example/api/repositories', { headers }),
  env(mock),
  ctx,
);

describe('repositories payload projection', () => {
  it('serves only the fields the app reads and keeps the projected ETag stable', async () => {
    const mock = createD1Mock();
    await put(mock, [REPOSITORY_ROW]);

    const response = await get(mock);
    const body = await response.json() as { repositories: Record<string, unknown>[]; total: number };

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(Object.keys(body.repositories[0]).sort()).toEqual(SERVED_FIELDS);
    expect(body.repositories[0].owner).toEqual({
      login: 'owner',
      avatar_url: 'https://avatars.githubusercontent.com/u/7?v=4',
    });

    const revalidated = await get(mock, { 'If-None-Match': String(response.headers.get('ETag')) });
    expect(revalidated.status).toBe(304);
  });

  it('keeps the stripped fields in D1 when the client writes back a projected row', async () => {
    const mock = createD1Mock();
    await put(mock, [REPOSITORY_ROW]);

    const projected = {
      ...REPOSITORY_ROW,
      owner: { login: 'owner', avatar_url: REPOSITORY_ROW.owner.avatar_url },
    } as Record<string, unknown>;
    for (const field of ['node_id', 'url', 'forks_url', 'collaborators_url', 'clone_url', 'ssh_url', 'homepage', 'size', 'watchers_count', 'has_issues', 'has_wiki', 'visibility']) {
      delete projected[field];
    }
    await put(mock, [projected]);

    const stored = mock.storedRepositories()[0];
    expect(stored.homepage).toBe('https://example.com');
    expect(stored.node_id).toBe('R_kgDOTest');
    expect(stored.clone_url).toBe('https://github.com/owner/demo.git');
    expect(stored.forks_url).toBe('https://api.github.com/repos/owner/demo/forks');
    expect((stored.owner as Record<string, unknown>).id).toBe(7);
    expect((stored.owner as Record<string, unknown>).type).toBe('User');
    expect((stored.owner as Record<string, unknown>).login).toBe('owner');
  });

  it('lets a fresh GitHub payload overwrite the preserved fields', async () => {
    const mock = createD1Mock();
    await put(mock, [REPOSITORY_ROW]);
    await put(mock, [{ ...REPOSITORY_ROW, homepage: 'https://updated.example.com' }]);

    expect(mock.storedRepositories()[0].homepage).toBe('https://updated.example.com');
  });
});
