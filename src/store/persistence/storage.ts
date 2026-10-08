
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { getStorageEntriesStrict, getStorageItemStrict, hasLegacySnapshot, indexedDBStorage, removeLegacySnapshot, setStorageEntries } from '../../services/indexedDbStorage';
import { PERSISTENCE_SHARD_FORMAT, PERSISTENCE_SHARD_NAMES, buildShardViews, findDirtyShards, metaKeyFor, shardKeyFor, type PersistenceShardName, type ShardMeta, type ShardPayload, type ShardViews } from './shards';
import { logger } from '../../services/logger';


const SHARD_SIZE_WARN_BYTES = 5 * 1024 * 1024;
let largeShardIdleWriteMinIntervalMs = 60_000;
const lastWrittenShardBytes = new Map<PersistenceShardName, number>();
const lastShardWriteAt = new Map<PersistenceShardName, number>();
let deferredLargeShardWriteTimerId: ReturnType<typeof setTimeout> | null = null;
let lastWrittenShards: ShardViews | null = null;
let legacySnapshotHydrated = false;
let hydratedIncomplete = false;
const committedShards = new Set<PersistenceShardName>();

export function __setPersistTimingsForTest(timings: { largeShardIdleMinIntervalMs?: number }): void {
  if (timings.largeShardIdleMinIntervalMs !== undefined) largeShardIdleWriteMinIntervalMs = timings.largeShardIdleMinIntervalMs;
}

const emptyShardViews = (): ShardViews => {
  const views = {} as ShardViews;
  for (const shard of PERSISTENCE_SHARD_NAMES) views[shard] = {};
  return views;
};

const parseMeta = (raw: string | null): ShardMeta | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ShardMeta>;
    return parsed.format === PERSISTENCE_SHARD_FORMAT && typeof parsed.version === 'number'
      && Array.isArray(parsed.shards) && parsed.shards.length === PERSISTENCE_SHARD_NAMES.length
      && PERSISTENCE_SHARD_NAMES.every((shard) => parsed.shards?.includes(shard) === true)
      ? parsed as ShardMeta : null;
  } catch { return null; }
};

const parseShard = (raw: string | null): { state: Record<string, unknown>; version: number } | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ShardPayload>;
    return parsed.format === PERSISTENCE_SHARD_FORMAT && !!parsed.state && typeof parsed.state === 'object'
      ? { state: parsed.state as Record<string, unknown>, version: typeof parsed.version === 'number' ? parsed.version : 0 } : null;
  } catch { return null; }
};

const readLegacySnapshot = async (name: string): Promise<StorageValue<unknown> | null> => {
  const raw = await getStorageItemStrict(name, name);
  if (!raw) return null;
  try { return JSON.parse(raw) as StorageValue<unknown>; } catch { return null; }
};

const readShardedSnapshot = async (name: string): Promise<StorageValue<unknown> | null> => {
  let meta: ShardMeta | null = null;
  try { meta = parseMeta(await getStorageItemStrict(name, metaKeyFor(name))); }
  catch (error) { hydratedIncomplete = true; logger.errorFromError('store.persist', 'Failed to read persistence meta', error); }

  if (!meta) {
    const legacy = await readLegacySnapshot(name).catch((error) => {
      hydratedIncomplete = true; logger.errorFromError('store.persist', 'Failed to read legacy persistence', error); return null;
    });
    if (legacy?.state && typeof legacy.state === 'object') {
      legacySnapshotHydrated = true;
      lastWrittenShards = buildShardViews(legacy.state as Record<string, unknown>);
      hydratedIncomplete = false;
      return legacy;
    }
    const keys = PERSISTENCE_SHARD_NAMES.map((shard) => shardKeyFor(name, shard));
    let orphaned: Array<string | null> = [];
    let orphanReadFailed = false;
    try { orphaned = await getStorageEntriesStrict(name, keys); }
    catch { orphanReadFailed = true; hydratedIncomplete = true; }
    const state: Record<string, unknown> = {};
    let version = 0;
    let parsedCount = 0;
    orphaned.forEach((raw) => {
      const shard = parseShard(raw);
      if (shard) { Object.assign(state, shard.state); version ||= shard.version; parsedCount++; }
    });
    if (parsedCount > 0) {
      if (orphanReadFailed || parsedCount < PERSISTENCE_SHARD_NAMES.length) hydratedIncomplete = true;
      lastWrittenShards = null;
      legacySnapshotHydrated = true;
      return { state, version };
    }
    if (!orphanReadFailed) hydratedIncomplete = false;
    return null;
  }

  const keys = PERSISTENCE_SHARD_NAMES.map((shard) => shardKeyFor(name, shard));
  let rawShards: Array<string | null> = [];
  try { rawShards = await getStorageEntriesStrict(name, keys); }
  catch (error) { hydratedIncomplete = true; logger.errorFromError('store.persist', 'Failed to read persistence shards', error); }
  const state: Record<string, unknown> = {};
  const views = emptyShardViews();
  let missing = false;
  PERSISTENCE_SHARD_NAMES.forEach((shard, index) => {
    const parsed = parseShard(rawShards[index] ?? null);
    if (!parsed) { missing = true; return; }
    Object.assign(state, parsed.state); views[shard] = parsed.state;
  });
  if (!missing && !hydratedIncomplete) {
    lastWrittenShards = views;
    if (await hasLegacySnapshot(name)) void removeLegacySnapshot(name);
    return { state, version: meta.version };
  }
  const legacy = await readLegacySnapshot(name).catch(() => null);
  if (legacy?.state && typeof legacy.state === 'object') {
    const legacyState = legacy.state as Record<string, unknown>;
    const legacyViews = buildShardViews(legacyState);
    PERSISTENCE_SHARD_NAMES.forEach((shard) => { if (Object.keys(views[shard]).length === 0) views[shard] = legacyViews[shard]; });
    lastWrittenShards = views; legacySnapshotHydrated = true;
    return { state: { ...legacyState, ...state }, version: meta.version };
  }
  lastWrittenShards = views;
  hydratedIncomplete = true;
  return { state, version: meta.version };
};

const cooldownRemaining = (shard: PersistenceShardName): number => {
  if ((lastWrittenShardBytes.get(shard) ?? 0) <= SHARD_SIZE_WARN_BYTES) return 0;
  const at = lastShardWriteAt.get(shard);
  return at === undefined ? 0 : Math.max(0, largeShardIdleWriteMinIntervalMs - (Date.now() - at));
};

const scheduleIdleTask = (callback: () => void): number => {
  if (typeof window === 'undefined') {
    return setTimeout(callback, 0) as unknown as number;
  }

  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 3000 });
  }

  return globalThis.setTimeout(callback, 0) as unknown as number;
};

const cancelIdleTask = (id: number): void => {
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(id);
    return;
  }

  clearTimeout(id);
};

let persistTimeoutId: ReturnType<typeof setTimeout> | null = null;
let persistIdleTaskId: number | null = null;
let latestPersistName: string | null = null;
let latestPersistValue: StorageValue<unknown> | null = null;
let persistWriteVersion = 0;
let persistFlushListenersRegistered = false;

const cancelPendingPersistTasks = (): void => {
  if (persistTimeoutId) { clearTimeout(persistTimeoutId); persistTimeoutId = null; }
  if (persistIdleTaskId !== null) { cancelIdleTask(persistIdleTaskId); persistIdleTaskId = null; }
  if (deferredLargeShardWriteTimerId !== null) { clearTimeout(deferredLargeShardWriteTimerId); deferredLargeShardWriteTimerId = null; }
};

let writeChain: Promise<void> = Promise.resolve();

const writePersistSnapshot = (
  name: string,
  value: StorageValue<unknown>,
  version: number,
  source: 'idle' | 'flush',
): void => {
  if (latestPersistValue === null || latestPersistName !== name || persistWriteVersion !== version || hydratedIncomplete) return;
  writeChain = writeChain.catch(() => undefined).then(async () => {
    if (latestPersistValue === null || latestPersistName !== name || persistWriteVersion !== version) return;
    const views = buildShardViews((value.state ?? {}) as Record<string, unknown>);
    let dirty = legacySnapshotHydrated ? [...PERSISTENCE_SHARD_NAMES] : findDirtyShards(views, lastWrittenShards);
    if (source === 'idle') {
      let remaining = 0;
      dirty = dirty.filter((shard) => {
        const wait = cooldownRemaining(shard);
        remaining = Math.max(remaining, wait);
        return wait === 0;
      });
      if (remaining > 0) {
        if (deferredLargeShardWriteTimerId !== null) clearTimeout(deferredLargeShardWriteTimerId);
        deferredLargeShardWriteTimerId = setTimeout(() => {
          deferredLargeShardWriteTimerId = null;
          if (latestPersistName && latestPersistValue) writePersistSnapshot(latestPersistName, latestPersistValue, persistWriteVersion, 'idle');
        }, remaining);
      }
    }
    if (dirty.length === 0) return;
    const entries: Array<readonly [string, string]> = [];
    const bytes = new Map<PersistenceShardName, number>();
    try {
      for (const shard of dirty) {
        const serialized = JSON.stringify({ format: PERSISTENCE_SHARD_FORMAT, version: value.version, state: views[shard] });
        bytes.set(shard, serialized.length < SHARD_SIZE_WARN_BYTES ? new TextEncoder().encode(serialized).length : serialized.length);
        entries.push([shardKeyFor(name, shard), serialized]);
      }
      entries.push([metaKeyFor(name), JSON.stringify({ format: PERSISTENCE_SHARD_FORMAT, version: value.version, shards: [...PERSISTENCE_SHARD_NAMES], savedAt: new Date().toISOString() })]);
      await setStorageEntries(name, entries);
    } catch (error) {
      logger.errorFromError('store.persist', 'Sharded persist write failed; previous snapshot kept', error, { source, shards: dirty });
      return;
    }
    lastWrittenShards = { ...(lastWrittenShards ?? emptyShardViews()) };
    const writtenAt = Date.now();
    dirty.forEach((shard) => {
      lastWrittenShards![shard] = views[shard];
      committedShards.add(shard);
      lastWrittenShardBytes.set(shard, bytes.get(shard) ?? 0);
      lastShardWriteAt.set(shard, writtenAt);
    });
    if (legacySnapshotHydrated && PERSISTENCE_SHARD_NAMES.every((shard) => committedShards.has(shard))) {
      legacySnapshotHydrated = false;
      await removeLegacySnapshot(name);
    }
  }).catch((error) => logger.errorFromError('store.persist', 'Persist write chain failed', error, { source }));
};
export const flushPendingPersistSnapshot = (): Promise<void> => {
  if (latestPersistName === null || latestPersistValue === null) return writeChain;
  cancelPendingPersistTasks();
  writePersistSnapshot(latestPersistName, latestPersistValue, persistWriteVersion, 'flush');
  return writeChain;
};
const registerPersistFlushListeners = (): void => {
  if (persistFlushListenersRegistered || typeof window === 'undefined') return;
  persistFlushListenersRegistered = true;

  window.addEventListener('pagehide', flushPendingPersistSnapshot);
  window.addEventListener('beforeunload', flushPendingPersistSnapshot);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushPendingPersistSnapshot();
      }
    });
  }
};

export const removePersistedSnapshot = (name: string): Promise<void> => {
  latestPersistName = null;
  latestPersistValue = null;
  persistWriteVersion++;
  cancelPendingPersistTasks();
  const removal = writeChain.catch(() => undefined).then(() => indexedDBStorage.removeItem(name));
  writeChain = removal.catch((error) => {
    logger.errorFromError('store.persist', 'Failed to remove persisted state snapshot', error);
  }).then(() => {
    lastWrittenShards = null;
    committedShards.clear();
    legacySnapshotHydrated = false;
    hydratedIncomplete = false;
    lastWrittenShardBytes.clear();
    lastShardWriteAt.clear();
  });
  return removal.then(() => writeChain);
};

// Create a debounced storage to avoid frequent JSON.stringify calls on large state objects
// which causes V8 JIT assertion failures (EXC_BREAKPOINT) on macOS ARM64.
const debouncedPersistStorage: PersistStorage<unknown> = {
  getItem: async (name) => {
    hydratedIncomplete = false;
    return readShardedSnapshot(name);
  },
  setItem: (name: string, value: StorageValue<unknown>) => {
    registerPersistFlushListeners();
    latestPersistName = name;
    latestPersistValue = value;
    persistWriteVersion++;
    const scheduledVersion = persistWriteVersion;

    cancelPendingPersistTasks();
    persistTimeoutId = setTimeout(() => {
      persistTimeoutId = null;
      persistIdleTaskId = scheduleIdleTask(() => {
        persistIdleTaskId = null;
        writePersistSnapshot(name, value, scheduledVersion, 'idle');
      });
    }, 1000);
  },
  removeItem: (name) => removePersistedSnapshot(name)
};

export { debouncedPersistStorage };
