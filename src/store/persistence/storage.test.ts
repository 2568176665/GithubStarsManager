import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange as FakeIDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { getStorageEntriesStrict, indexedDBStorage, setStorageEntries } from '../../services/indexedDbStorage';
import { debouncedPersistStorage, flushPendingPersistSnapshot } from './storage';
import { buildShardViews, findDirtyShards, PERSISTENCE_SHARD_NAMES } from './shards';

const storageName = 'persistence-test';

beforeEach(() => {
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: fakeIndexedDB });
  vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
  window.localStorage.clear();
});

afterEach(async () => {
  await indexedDBStorage.removeItem(storageName);
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('persistence shards', () => {
  it('routes large fields separately and compares core values by content', () => {
    const repositories = [{ id: 1 }];
    const first = buildShardViews({ repositories, theme: 'light', searchFilters: { sortBy: 'stars' } });
    const second = buildShardViews({ repositories, theme: 'light', searchFilters: { sortBy: 'stars' } });

    expect(Object.keys(first)).toEqual(PERSISTENCE_SHARD_NAMES);
    expect(findDirtyShards(first, null)).toEqual([...PERSISTENCE_SHARD_NAMES]);
    expect(findDirtyShards(second, first)).toEqual([]);
    expect(first.repositories.repositories).toBe(repositories);
  });
});

describe('atomic persistence storage', () => {
  it('writes and reads all shard entries through IndexedDB', async () => {
    const entries = [
      [storageName + '#shard:core', 'core'] as const,
      [storageName + '#shard:repositories', 'repositories'] as const,
      [storageName + '#meta', 'meta'] as const,
    ];

    await setStorageEntries(storageName, entries);

    await expect(getStorageEntriesStrict(storageName, entries.map(([key]) => key))).resolves.toEqual(['core', 'repositories', 'meta']);
  });

  it('uses localStorage as the authoritative fallback when IndexedDB is unavailable', async () => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
    const entries = [[storageName + '#shard:core', 'fallback']] as const;

    await setStorageEntries(storageName, entries);

    await expect(getStorageEntriesStrict(storageName, entries.map(([key]) => key))).resolves.toEqual(['fallback']);
    expect(window.localStorage.getItem(storageName + '#fallback')).not.toBeNull();
  });
  
  it('reads a legacy single-key snapshot before the first sharded write', async () => {
    await indexedDBStorage.setItem(storageName, JSON.stringify({ state: { theme: 'dark' }, version: 14 }));

    await expect(debouncedPersistStorage.getItem(storageName)).resolves.toEqual({
      state: { theme: 'dark' },
      version: 14,
    });
  });

  it('rolls back localStorage fallback entries when a later key fails', async () => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
    const values = new Map<string, string>();
    const fallbackStorage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => Array.from(values.keys())[index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => {
        if (key.endsWith('#shard:repositories')) throw new Error('quota');
        values.set(key, value);
      },
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: fallbackStorage });
    const entries = [
      [storageName + '#shard:core', 'core'] as const,
      [storageName + '#shard:repositories', 'repositories'] as const,
    ];

    await expect(setStorageEntries(storageName, entries)).rejects.toThrow('localStorage fallback write failed');
    expect(window.localStorage.getItem(storageName + '#shard:core')).toBeNull();
  });

  it('migrates a legacy snapshot into all shards on flush', async () => {
    await indexedDBStorage.setItem(storageName, JSON.stringify({ state: { theme: 'dark', repositories: [{ id: 1 }] }, version: 14 }));
    await expect(debouncedPersistStorage.getItem(storageName)).resolves.toMatchObject({ state: { theme: 'dark' }, version: 14 });

    debouncedPersistStorage.setItem(storageName, { state: { theme: 'dark', repositories: [{ id: 1 }] }, version: 14 });
    await flushPendingPersistSnapshot();

    const values = await getStorageEntriesStrict(storageName, PERSISTENCE_SHARD_NAMES.map((shard) => storageName + '#shard:' + shard));
    expect(values.every((value) => value !== null)).toBe(true);
  });

  it('refuses to rewrite a snapshot when a declared shard is missing', async () => {
    const meta = JSON.stringify({ format: 1, version: 14, shards: [...PERSISTENCE_SHARD_NAMES], savedAt: new Date().toISOString() });
    await setStorageEntries(storageName, [
      [storageName + '#meta', meta],
      [storageName + '#shard:core', JSON.stringify({ format: 1, version: 14, state: { theme: 'dark' } })],
    ]);
    await debouncedPersistStorage.getItem(storageName);
    debouncedPersistStorage.setItem(storageName, { state: { theme: 'dark' }, version: 14 });
    await flushPendingPersistSnapshot();

    const repositories = await getStorageEntriesStrict(storageName, [storageName + '#shard:repositories']);
    expect(repositories).toEqual([null]);
  });
  it('removes legacy and derived keys together', async () => {
    await indexedDBStorage.setItem(storageName, 'legacy');
    await setStorageEntries(storageName, [[storageName + '#shard:core', 'core'], [storageName + '#meta', 'meta']]);

    await indexedDBStorage.removeItem(storageName);

    await expect(getStorageEntriesStrict(storageName, [storageName, storageName + '#shard:core', storageName + '#meta'])).resolves.toEqual([null, null, null]);
  });


});
