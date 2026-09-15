const MAX_README_CHARS = 12_000;
const SEARCH_PROJECTION_VERSION = 1;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

type JsonRecord = Record<string, unknown>;

export type SearchQuality = 'identity' | 'strong-field' | 'weak-text' | 'no-results';

export interface SearchRequest {
  query?: unknown;
  filters?: JsonRecord;
  limit?: unknown;
  offset?: unknown;
}

export interface SearchItem {
  id: number;
  score: number;
  matchedFields: string[];
}

export interface SearchResponse {
  items: SearchItem[];
  total: number;
  quality: SearchQuality;
  source: 'fts' | 'field-fallback';
  projectionVersion: number;
}

interface SearchDocument {
  repository_id: number;
  full_name: string;
  name: string;
  description: string;
  topics: string;
  tags: string;
  ai_summary: string;
  custom_description: string;
  language: string;
  ai_platforms: string;
  custom_category: string;
  license: string;
  readme: string;
  stargazers_count: number;
  subscribed_to_releases: number;
  analyzed_at: string | null;
  analysis_failed: number;
  category_locked: number;
  last_edited: string | null;
  updated_at: string | null;
  pushed_at: string | null;
  starred_at: string | null;
  bm25_score?: number;
}

const SEARCH_FIELDS = [
  'full_name',
  'name',
  'topics',
  'tags',
  'description',
  'ai_summary',
  'custom_description',
  'language',
  'ai_platforms',
  'custom_category',
  'license',
  'readme',
] as const;

const STRONG_FIELDS = new Set(['full_name', 'name', 'topics', 'tags']);
const NO_LICENSE_SENTINEL = '__NO_LICENSE__';
const FIELD_WEIGHTS: Record<string, number> = {
  full_name: 12,
  name: 10,
  topics: 7,
  tags: 7,
  description: 5,
  ai_summary: 5,
  custom_description: 4,
  language: 3,
  ai_platforms: 3,
  custom_category: 2,
  license: 2,
  readme: 1,
};

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function values(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function joinValues(value: unknown): string {
  return values(value).join('\n');
}

function normalizeLicense(value: unknown): string {
  let resolved = '';
  if (typeof value === 'string') resolved = value.trim();
  else if (isRecord(value)) {
    const spdx = text(value.spdx_id);
    const key = text(value.key);
    resolved = spdx || key;
  }
  return !resolved || ['noassertion', 'other', 'none', 'no-license'].includes(resolved.toLocaleLowerCase())
    ? NO_LICENSE_SENTINEL
    : resolved;
}

function integer(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function booleanFlag(value: unknown): number {
  return value === true ? 1 : 0;
}

export function cleanReadme(value: unknown, maxChars = MAX_README_CHARS): string {
  const raw = text(value);
  if (!raw) return '';
  const cleaned = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[>*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, Math.max(0, Math.min(maxChars, MAX_README_CHARS)));
}

function repositoryToDocument(repository: JsonRecord, readme = ''): SearchDocument | null {
  const repositoryId = Number(repository.id);
  if (!Number.isSafeInteger(repositoryId)) return null;
  const topics = joinValues(repository.topics);
  const tags = [...values(repository.ai_tags), ...values(repository.custom_tags)].join('\n');
  return {
    repository_id: repositoryId,
    full_name: text(repository.full_name),
    name: text(repository.name),
    description: text(repository.description),
    topics,
    tags,
    ai_summary: text(repository.ai_summary),
    custom_description: text(repository.custom_description),
    language: text(repository.language),
    ai_platforms: joinValues(repository.ai_platforms),
    custom_category: text(repository.custom_category),
    license: normalizeLicense(repository.license),
    readme: cleanReadme(readme),
    stargazers_count: integer(repository.stargazers_count, 0),
    subscribed_to_releases: booleanFlag(repository.subscribed_to_releases),
    analyzed_at: text(repository.analyzed_at) || null,
    analysis_failed: booleanFlag(repository.analysis_failed),
    category_locked: booleanFlag(repository.category_locked),
    last_edited: text(repository.last_edited) || null,
    updated_at: text(repository.updated_at) || null,
    pushed_at: text(repository.pushed_at) || null,
    starred_at: text(repository.starred_at) || null,
  };
}

function documentParams(document: SearchDocument): unknown[] {
  return [
    document.repository_id,
    document.full_name,
    document.name,
    document.description,
    document.topics,
    document.tags,
    document.ai_summary,
    document.custom_description,
    document.language,
    document.ai_platforms,
    document.custom_category,
    document.license,
    document.readme,
    document.stargazers_count,
    document.subscribed_to_releases,
    document.analyzed_at,
    document.analysis_failed,
    document.category_locked,
    document.last_edited,
    document.updated_at,
    document.pushed_at,
    document.starred_at,
    Date.now(),
  ];
}

function ftsParams(document: SearchDocument): unknown[] {
  return [
    document.repository_id,
    document.full_name,
    document.name,
    document.topics,
    document.tags,
    document.description,
    document.ai_summary,
    document.custom_description,
    document.language,
    document.ai_platforms,
    document.custom_category,
    document.license,
    document.readme,
  ];
}

async function storedRepositories(env: Env): Promise<JsonRecord[]> {
  const row = await env.DB.prepare('SELECT value FROM sync_state WHERE key = ?').bind('repositories').first<{ value: string }>();
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

async function projectionCount(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM repository_search_documents').first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function writeProjectionMeta(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO repository_search_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).bind(key, JSON.stringify(value), Date.now()).run();
}

async function readProjectionMeta<T>(env: Env, key: string, fallback: T): Promise<T> {
  const row = await env.DB.prepare('SELECT value FROM repository_search_meta WHERE key = ?').bind(key).first<{ value: string }>();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function refreshSearchProjection(env: Env, repositories: unknown[]): Promise<void> {
  const existingReadmes = await env.DB.prepare(
    'SELECT repository_id, readme FROM repository_search_documents WHERE readme <> \'\'',
  ).all<{ repository_id: number; readme: string }>();
  const readmeById = new Map(existingReadmes.results.map((row) => [row.repository_id, row.readme]));
  const documents = repositories
    .filter(isRecord)
    .map((repository) => repositoryToDocument(repository, readmeById.get(Number(repository.id)) || ''))
    .filter((document): document is SearchDocument => document !== null);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM repository_search_fts'),
    env.DB.prepare('DELETE FROM repository_search_documents'),
  ]);

  // Keep each D1 batch below the platform statement limit: one document uses
  // two statements (the projection row and its FTS row).
  for (let index = 0; index < documents.length; index += 40) {
    const batch = documents.slice(index, index + 40).flatMap((document) => [
      env.DB.prepare(
        `INSERT INTO repository_search_documents (
          repository_id, full_name, name, description, topics, tags, ai_summary,
          custom_description, language, ai_platforms, custom_category, license, readme,
          stargazers_count, subscribed_to_releases, analyzed_at, analysis_failed,
          category_locked, last_edited, updated_at, pushed_at, starred_at, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(...documentParams(document)),
      env.DB.prepare(
        `INSERT INTO repository_search_fts (
          repository_id, full_name, name, topics, tags, description, ai_summary,
          custom_description, language, ai_platforms, custom_category, license, readme
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(...ftsParams(document)),
    ]);
    await env.DB.batch(batch);
  }

  await writeProjectionMeta(env, 'projection_version', SEARCH_PROJECTION_VERSION);
  await writeProjectionMeta(env, 'last_synced_at', new Date().toISOString());
}

export async function ensureSearchProjection(env: Env): Promise<void> {
  const version = await readProjectionMeta<number>(env, 'projection_version', 0);
  const stored = await storedRepositories(env);
  const count = await projectionCount(env);
  if (version !== SEARCH_PROJECTION_VERSION || count !== stored.length) {
    await refreshSearchProjection(env, stored);
  }
}

function normalizeQuery(query: unknown): string {
  return typeof query === 'string' ? query.normalize('NFKC').trim().slice(0, 300) : '';
}

function queryTerms(query: string): string[] {
  return query.toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0, 20);
}

function escapeFtsQuery(query: string): string {
  return queryTerms(query)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' AND ');
}

function filterSql(filters: JsonRecord | undefined): { sql: string; bindings: unknown[] } {
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  const list = (key: string): string[] => {
    const value = filters?.[key];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  };

  const languages = list('languages');
  if (languages.length) {
    clauses.push(`d.language IN (${languages.map(() => '?').join(', ')})`);
    bindings.push(...languages);
  }
  const licenses = list('licenses');
  if (licenses.length) {
    clauses.push(`d.license IN (${licenses.map(() => '?').join(', ')})`);
    bindings.push(...licenses);
  }
  const tags = list('tags');
  if (tags.length) {
    clauses.push(`(${tags.map(() => 'lower(d.topics || \'\\n\' || d.tags) LIKE ?').join(' OR ')})`);
    bindings.push(...tags.map((tag) => `%${tag.toLocaleLowerCase()}%`));
  }
  const platforms = list('platforms');
  if (platforms.length) {
    clauses.push(`(${platforms.map(() => 'lower(d.ai_platforms) LIKE ?').join(' OR ')})`);
    bindings.push(...platforms.map((platform) => `%${platform.toLocaleLowerCase()}%`));
  }
  const flag = (key: string, column: string): void => {
    if (filters?.[key] === true) clauses.push(`d.${column} = 1`);
    if (filters?.[key] === false) clauses.push(`d.${column} = 0`);
  };
  flag('isSubscribed', 'subscribed_to_releases');
  flag('isCategoryLocked', 'category_locked');
  flag('analysisFailed', 'analysis_failed');
  if (filters?.isAnalyzed === true) clauses.push('d.analyzed_at IS NOT NULL AND d.analysis_failed = 0');
  if (filters?.isAnalyzed === false) clauses.push('d.analyzed_at IS NULL');
  if (filters?.minStars !== undefined) {
    clauses.push('d.stargazers_count >= ?');
    bindings.push(Number(filters.minStars));
  }
  if (filters?.maxStars !== undefined) {
    clauses.push('d.stargazers_count <= ?');
    bindings.push(Number(filters.maxStars));
  }
  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', bindings };
}

function documentFromRow(row: JsonRecord): SearchDocument {
  return row as unknown as SearchDocument;
}

function matchedFields(document: SearchDocument, terms: string[]): string[] {
  return SEARCH_FIELDS.filter((field) => {
    const value = String(document[field] || '').toLocaleLowerCase();
    return terms.some((term) => value.includes(term));
  });
}

function fieldScore(document: SearchDocument, terms: string[]): number {
  let score = 0;
  for (const field of SEARCH_FIELDS) {
    const value = String(document[field] || '').toLocaleLowerCase();
    if (!value) continue;
    for (const term of terms) {
      if (!value.includes(term)) continue;
      score += FIELD_WEIGHTS[field];
      if (field === 'name' || field === 'full_name') {
        if (value === term) score += 40;
        else if (value.startsWith(term)) score += 20;
      }
    }
  }
  const bm25 = typeof document.bm25_score === 'number' ? document.bm25_score : 0;
  return score + (bm25 < 0 ? 1 / (1 + Math.abs(bm25)) : 0);
}

function classifyQuality(documents: SearchDocument[], query: string): SearchQuality {
  if (!documents.length) return 'no-results';
  const normalizedQuery = query.toLocaleLowerCase();
  const top = documents[0];
  const fullName = top.full_name.toLocaleLowerCase();
  const name = top.name.toLocaleLowerCase();
  if (normalizedQuery && (
    fullName === normalizedQuery
    || name === normalizedQuery
    || name.startsWith(normalizedQuery)
    || fullName.startsWith(`${normalizedQuery}/`)
  )) return 'identity';
  const terms = queryTerms(query);
  const strongText = STRONG_FIELDS.values();
  const strongValues = [...strongText].map((field) => String(top[field as keyof SearchDocument] || '').toLocaleLowerCase()).join(' ');
  if (terms.length > 0 && terms.every((term) => strongValues.includes(term))) return 'strong-field';
  return 'weak-text';
}

function rankDocuments(documents: SearchDocument[], query: string): SearchDocument[] {
  const terms = queryTerms(query);
  return [...documents].sort((a, b) => {
    const difference = fieldScore(b, terms) - fieldScore(a, terms);
    if (difference !== 0) return difference;
    return b.stargazers_count - a.stargazers_count;
  });
}

async function ftsRows(env: Env, query: string, filters: JsonRecord | undefined, limit: number, offset: number): Promise<SearchDocument[]> {
  const { sql, bindings } = filterSql(filters);
  const result = await env.DB.prepare(
    `SELECT d.*, bm25(f, 0, 12, 10, 7, 7, 5, 5, 4, 3, 3, 2, 2, 1) AS bm25_score
     FROM repository_search_fts f
     JOIN repository_search_documents d ON d.repository_id = CAST(f.repository_id AS INTEGER)
     WHERE repository_search_fts MATCH ?${sql}
     ORDER BY bm25_score ASC
     LIMIT ? OFFSET ?`,
  ).bind(escapeFtsQuery(query), ...bindings, limit, offset).all<JsonRecord>();
  return result.results.map(documentFromRow);
}

async function fieldRows(env: Env, query: string, filters: JsonRecord | undefined, limit: number, offset: number): Promise<SearchDocument[]> {
  const { sql, bindings } = filterSql(filters);
  const terms = queryTerms(query);
  const textClauses = terms.map(() => `lower(
    d.full_name || ' ' || d.name || ' ' || d.topics || ' ' || d.tags || ' ' ||
    d.description || ' ' || d.ai_summary || ' ' || d.custom_description || ' ' ||
    d.language || ' ' || d.ai_platforms || ' ' || d.custom_category || ' ' || d.license || ' ' || d.readme
  ) LIKE ?`).join(' AND ');
  const result = await env.DB.prepare(
    `SELECT d.* FROM repository_search_documents d WHERE ${textClauses || '1 = 1'}${sql} LIMIT ? OFFSET ?`,
  ).bind(...terms.map((term) => `%${term}%`), ...bindings, limit, offset).all<JsonRecord>();
  return result.results.map(documentFromRow);
}

async function countRows(env: Env, filters: JsonRecord | undefined): Promise<number> {
  const { sql, bindings } = filterSql(filters);
  const result = await env.DB.prepare(`SELECT COUNT(*) AS count FROM repository_search_documents d WHERE 1 = 1${sql}`)
    .bind(...bindings)
    .first<{ count: number }>();
  return Number(result?.count ?? 0);
}

async function countFieldSearchRows(env: Env, query: string, filters: JsonRecord | undefined): Promise<number> {
  const { sql, bindings } = filterSql(filters);
  const terms = queryTerms(query);
  const textClauses = terms.map(() => `lower(
    d.full_name || ' ' || d.name || ' ' || d.topics || ' ' || d.tags ||
    ' ' || d.description || ' ' || d.ai_summary || ' ' || d.custom_description ||
    ' ' || d.language || ' ' || d.ai_platforms || ' ' || d.custom_category ||
    ' ' || d.license || ' ' || d.readme
  ) LIKE ?`).join(' AND ');
  const result = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM repository_search_documents d WHERE ${textClauses || '1 = 1'}${sql}`,
  ).bind(...terms.map((term) => `%${term}%`), ...bindings).first<{ count: number }>();
  return Number(result?.count ?? 0);
}

async function countSearchRows(
  env: Env,
  query: string,
  filters: JsonRecord | undefined,
  source: SearchResponse['source'],
): Promise<number> {
  if (source === 'field-fallback') return countFieldSearchRows(env, query, filters);
  const { sql, bindings } = filterSql(filters);
  try {
    const result = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM repository_search_fts f
       JOIN repository_search_documents d ON d.repository_id = CAST(f.repository_id AS INTEGER)
       WHERE repository_search_fts MATCH ?${sql}`,
    ).bind(escapeFtsQuery(query), ...bindings).first<{ count: number }>();
    return Number(result?.count ?? 0);
  } catch {
    return countFieldSearchRows(env, query, filters);
  }
}

export async function searchRepositoryIndex(env: Env, input: SearchRequest): Promise<SearchResponse> {
  await ensureSearchProjection(env);
  const query = normalizeQuery(input.query);
  const limit = Math.min(MAX_LIMIT, Math.max(1, integer(input.limit, DEFAULT_LIMIT)));
  const offset = Math.max(0, integer(input.offset, 0));
  const filters = isRecord(input.filters) ? input.filters : undefined;
  if (!query) {
    const total = await countRows(env, filters);
    return { items: [], total, quality: 'no-results', source: 'fts', projectionVersion: SEARCH_PROJECTION_VERSION };
  }

  let documents: SearchDocument[] = [];
  let source: SearchResponse['source'] = 'fts';
  try {
    documents = await ftsRows(env, query, filters, limit, offset);
  } catch (error) {
    console.error(JSON.stringify({ message: 'D1 FTS search failed', error: error instanceof Error ? error.message : String(error) }));
    source = 'field-fallback';
  }

  if (documents.length === 0) {
    source = 'field-fallback';
    documents = await fieldRows(env, query, filters, limit, offset);
  }
  const ranked = rankDocuments(documents, query);
  const quality = classifyQuality(ranked, query);
  return {
    items: ranked.map((document) => ({
      id: document.repository_id,
      score: fieldScore(document, queryTerms(query)),
      matchedFields: matchedFields(document, queryTerms(query)),
    })),
    total: await countSearchRows(env, query, filters, source),
    quality,
    source,
    projectionVersion: SEARCH_PROJECTION_VERSION,
  };
}

export async function cacheRepositoryReadme(env: Env, input: JsonRecord): Promise<{ repositoryId: number; chars: number }> {
  const repositoryId = Number(input.repositoryId ?? input.id);
  if (!Number.isSafeInteger(repositoryId)) throw new Error('repositoryId is required');
  const readme = cleanReadme(input.readme);
  await ensureSearchProjection(env);
  const existing = await env.DB.prepare('SELECT repository_id FROM repository_search_documents WHERE repository_id = ?')
    .bind(repositoryId).first<{ repository_id: number }>();
  if (!existing) {
    const repositories = await storedRepositories(env);
    await refreshSearchProjection(env, repositories);
  }
  const document = await env.DB.prepare('SELECT * FROM repository_search_documents WHERE repository_id = ?')
    .bind(repositoryId).first<JsonRecord>();
  if (!document) throw new Error('Repository not found in search projection');
  const next = { ...document, readme } as unknown as SearchDocument;
  await env.DB.batch([
    env.DB.prepare('UPDATE repository_search_documents SET readme = ?, indexed_at = ? WHERE repository_id = ?')
      .bind(readme, Date.now(), repositoryId),
    env.DB.prepare('DELETE FROM repository_search_fts WHERE repository_id = ?').bind(String(repositoryId)),
    env.DB.prepare(
      `INSERT INTO repository_search_fts (
        repository_id, full_name, name, topics, tags, description, ai_summary,
        custom_description, language, ai_platforms, custom_category, license, readme
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(...ftsParams(next)),
  ]);
  return { repositoryId, chars: readme.length };
}

function vectorBinding(env: Env): VectorizeIndex | null {
  return env.VECTORIZE || null;
}

export async function vectorStatus(env: Env): Promise<{ connected: boolean; vectorCount: number; dimensions: number }> {
  const vectorize = vectorBinding(env);
  if (!vectorize) throw new Error('Vectorize binding is not configured');
  const details = await vectorize.describe();
  const config = 'config' in details && details.config && typeof details.config === 'object'
    ? details.config as { dimensions?: unknown }
    : undefined;
  return {
    connected: true,
    vectorCount: Number('vectorCount' in details ? details.vectorCount : details.vectorsCount) || 0,
    dimensions: Number('dimensions' in details ? details.dimensions : config?.dimensions) || 0,
  };
}

function vectorValues(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new Error('vector values must be a non-empty number array');
  }
  return value;
}

export async function queryVectorIndex(env: Env, input: JsonRecord): Promise<{ matches: unknown[] }> {
  const vectorize = vectorBinding(env);
  if (!vectorize) throw new Error('Vectorize binding is not configured');
  const topK = Math.min(MAX_LIMIT, Math.max(1, integer(input.topK, 20)));
  const threshold = typeof input.threshold === 'number' && input.threshold >= 0 && input.threshold <= 1 ? input.threshold : undefined;
  const result = await vectorize.query(vectorValues(input.vector), { topK, returnMetadata: 'all' });
  const matches = result.matches
    .filter((match) => threshold === undefined || match.score >= threshold)
    .map((match) => ({ id: match.id, score: match.score, metadata: isRecord(match.metadata) ? match.metadata : {} }));
  return { matches };
}

function safeVectorMetadata(value: unknown): Record<string, string | number | boolean | string[]> | undefined {
  if (!isRecord(value)) return undefined;
  const metadata: Record<string, string | number | boolean | string[]> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || (Array.isArray(item) && item.every((entry) => typeof entry === 'string'))) {
      metadata[key] = item as string | number | boolean | string[];
    }
  }
  return metadata;
}

function safeVectors(input: unknown): Array<{ id: string; values: number[]; metadata?: Record<string, string | number | boolean | string[]> }> {
  if (!Array.isArray(input) || input.length === 0) throw new Error('vectors must be a non-empty array');
  return input.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id) throw new Error('vector id is required');
    const values = vectorValues(item.values);
    const metadata = safeVectorMetadata(item.metadata);
    return metadata ? { id: item.id, values, metadata } : { id: item.id, values };
  });
}

export async function upsertVectorIndex(env: Env, input: JsonRecord): Promise<{ upserted: number; mutationId?: string }> {
  const vectorize = vectorBinding(env);
  if (!vectorize) throw new Error('Vectorize binding is not configured');
  const vectors = safeVectors(input.vectors);
  const result = await vectorize.upsert(vectors);
  const ids = await readProjectionMeta<string[]>(env, 'vector_ids', []);
  await writeProjectionMeta(env, 'vector_ids', [...new Set([...ids, ...vectors.map((vector) => vector.id)])]);
  return { upserted: result.count, mutationId: undefined };
}

export async function deleteVectorIndex(env: Env, input: JsonRecord): Promise<{ deleted: number; mutationId?: string }> {
  const vectorize = vectorBinding(env);
  if (!vectorize) throw new Error('Vectorize binding is not configured');
  const ids = Array.isArray(input.ids) ? input.ids.filter((id): id is string => typeof id === 'string' && Boolean(id)) : [];
  if (!ids.length) return { deleted: 0 };
  const result = await vectorize.deleteByIds(ids);
  const tracked = await readProjectionMeta<string[]>(env, 'vector_ids', []);
  await writeProjectionMeta(env, 'vector_ids', tracked.filter((id) => !ids.includes(id)));
  return { deleted: result.count, mutationId: undefined };
}

export async function cleanupVectorIndex(env: Env, input: JsonRecord): Promise<{ deleted: number; mutationId?: string }> {
  const keepIds = new Set(Array.isArray(input.keepIds) ? input.keepIds.filter((id): id is string => typeof id === 'string') : []);
  const tracked = await readProjectionMeta<string[]>(env, 'vector_ids', []);
  const stale = tracked.filter((id) => !keepIds.has(id));
  return deleteVectorIndex(env, { ids: stale });
}
