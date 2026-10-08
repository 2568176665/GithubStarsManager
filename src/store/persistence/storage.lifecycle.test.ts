import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as idb from '../../services/indexedDbStorage';
import { __setPersistTimingsForTest, debouncedPersistStorage, flushPendingPersistSnapshot, removePersistedSnapshot } from './storage';
import { PERSISTENCE_SHARD_NAMES, shardKeyFor } from './shards';

const name = 'persistence-lifecycle-test';
const keys = PERSISTENCE_SHARD_NAMES.map((shard) => shardKeyFor(name, shard));
const state = () => ({ repositories: [{ id: 1 }], releases: [], gists: [], starredGists: [], forks: [], theme: 'light' });
const write = (value: Record<string, unknown>) => debouncedPersistStorage.setItem(name, { state: value, version: 14 });
const disk = () => idb.getStorageEntriesStrict(name, keys);

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  window.localStorage.clear();
  await removePersistedSnapshot(name);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removePersistedSnapshot(name);
  __setPersistTimingsForTest({ largeShardIdleMinIntervalMs: 60_000 });
  vi.unstubAllGlobals();
});

describe('persistence lifecycle', () => {
  it('reads committed fallback values even when IndexedDB reads fail', async () => {
    const key = shardKeyFor(name, 'core');
    await idb.setStorageEntries(name, [[key, 'old']]);
    vi.spyOn(window.indexedDB, 'open').mockImplementation(() => { throw new Error('database unavailable'); });
    await idb.writeEntriesToFallbackStorage(name, [[key, 'new']]);
    expect(await idb.getStorageItemStrict(name, key)).toBe('new');
    expect(await idb.getStorageEntriesStrict(name, [key])).toEqual(['new']);
  });

  it('rolls back fallback values when the authority marker cannot be committed', async () => {
    const key = shardKeyFor(name, 'core');
    window.localStorage.setItem(key, 'old');
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, storageKey, value) {
      if (storageKey === name + '#fallback') throw new Error('quota');
      original.call(this, storageKey, value);
    });
    await expect(idb.writeEntriesToFallbackStorage(name, [[key, 'new']])).rejects.toThrow('fallback marker write failed');
    expect(window.localStorage.getItem(key)).toBe('old');
  });

  it('does not serialize heavy shards for a UI-only update', async () => {
    const initial = state();
    write(initial);
    await flushPendingPersistSnapshot();
    const stringify = vi.spyOn(JSON, 'stringify');
    write({ ...initial, theme: 'dark' });
    await flushPendingPersistSnapshot();
    expect(stringify.mock.calls.some(([value]) => value?.state?.repositories === initial.repositories)).toBe(false);
    expect(JSON.parse((await disk())[0]!).state.theme).toBe('dark');
  });

  it('waits for an in-flight write before deleting, then writes a complete fresh snapshot', async () => {
    let begin!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { begin = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = idb.setStorageEntries;
    vi.spyOn(idb, 'setStorageEntries').mockImplementationOnce(async (...args) => {
      begin();
      await gate;
      return original(...args);
    });
    write(state());
    const pending = flushPendingPersistSnapshot();
    await started;
    const removal = removePersistedSnapshot(name);
    release();
    await Promise.all([pending, removal]);
    expect(await disk()).toEqual(keys.map(() => null));
    write({ ...state(), theme: 'dark' });
    await flushPendingPersistSnapshot();
    expect((await disk()).every((value) => value !== null)).toBe(true);
  });

  it('rejects deletion failures and keeps the next write usable', async () => {
    write(state());
    await flushPendingPersistSnapshot();
    vi.spyOn(idb.indexedDBStorage, 'removeItem').mockRejectedValueOnce(new Error('delete failed'));
    await expect(removePersistedSnapshot(name)).rejects.toThrow('delete failed');
    write({ ...state(), theme: 'dark' });
    await flushPendingPersistSnapshot();
    expect(JSON.parse((await disk())[0]!).state.theme).toBe('dark');
  });

  it('does not advance the dirty baseline after a failed write', async () => {
    const initial = state();
    write(initial);
    await flushPendingPersistSnapshot();
    const baseline = await disk();
    vi.spyOn(idb, 'setStorageEntries').mockRejectedValueOnce(new Error('quota'));
    write({ ...initial, repositories: [{ id: 2 }] });
    await flushPendingPersistSnapshot();
    expect(await disk()).toEqual(baseline);
    await flushPendingPersistSnapshot();
    const repositories = (await disk())[PERSISTENCE_SHARD_NAMES.indexOf('repositories')];
    expect(JSON.parse(repositories!).state.repositories).toEqual([{ id: 2 }]);
  });

  it('defers a large shard during idle writes while saving core, and flush bypasses the cooldown', async () => {
    __setPersistTimingsForTest({ largeShardIdleMinIntervalMs: 4000 });
    const initial = { ...state(), repositories: [{ id: 1, readme: 'x'.repeat(5 * 1024 * 1024 + 1) }] };
    write(initial);
    await flushPendingPersistSnapshot();
    const repoIndex = PERSISTENCE_SHARD_NAMES.indexOf('repositories');
    const before = (await disk())[repoIndex];
    write({ ...initial, repositories: [{ id: 2 }], theme: 'dark' });
    await vi.waitFor(async () => {
      expect(JSON.parse((await disk())[0]!).state.theme).toBe('dark');
    }, { timeout: 2500, interval: 30 });
    expect((await disk())[repoIndex]).toBe(before);
    await flushPendingPersistSnapshot();
    expect(JSON.parse((await disk())[repoIndex]!).state.repositories).toEqual([{ id: 2 }]);
  });
});
