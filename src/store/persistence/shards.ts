export const PERSISTENCE_SHARD_FORMAT = 1;

export type PersistenceShardName = 'core' | 'repositories' | 'gists' | 'releases' | 'forks';

export const PERSISTENCE_SHARD_NAMES: readonly PersistenceShardName[] = [
  'core',
  'repositories',
  'gists',
  'releases',
  'forks',
];

export const PERSISTENCE_SHARD_FIELDS: Record<PersistenceShardName, readonly string[]> = {
  core: [],
  repositories: ['repositories'],
  gists: ['gists', 'starredGists'],
  releases: ['releases'],
  forks: ['forks'],
};

const FIELD_TO_SHARD = new Map<string, PersistenceShardName>();
for (const [shard, fields] of Object.entries(PERSISTENCE_SHARD_FIELDS)) {
  for (const field of fields) FIELD_TO_SHARD.set(field, shard as PersistenceShardName);
}

export const resolveShardForField = (field: string): PersistenceShardName =>
  FIELD_TO_SHARD.get(field) ?? 'core';

export const shardKeyFor = (name: string, shard: PersistenceShardName): string =>
  name + '#shard:' + shard;

export const metaKeyFor = (name: string): string => name + '#meta';

export interface ShardMeta {
  format: number;
  version: number;
  shards: PersistenceShardName[];
  savedAt: string;
}

export interface ShardPayload {
  format: number;
  version: number;
  state: Record<string, unknown>;
}

export type ShardViews = Record<PersistenceShardName, Record<string, unknown>>;

export const buildShardViews = (state: Record<string, unknown>): ShardViews => {
  const views = {} as ShardViews;
  for (const shard of PERSISTENCE_SHARD_NAMES) views[shard] = {};
  for (const [field, value] of Object.entries(state)) {
    views[resolveShardForField(field)][field] = value;
  }
  return views;
};

const smallValueEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

export const findDirtyShards = (
  views: ShardViews,
  lastWritten: ShardViews | null,
): PersistenceShardName[] => {
  if (!lastWritten) return [...PERSISTENCE_SHARD_NAMES];
  return PERSISTENCE_SHARD_NAMES.filter((shard) => {
    const next = views[shard];
    const prev = lastWritten[shard];
    if (!prev) return true;
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of keys) {
      if (shard === 'core' ? !smallValueEqual(prev[key], next[key]) : !Object.is(prev[key], next[key])) {
        return true;
      }
    }
    return false;
  });
};
