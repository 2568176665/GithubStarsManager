import type { StateStorage } from 'zustand/middleware';

export const DB_NAME = 'github-stars-manager-db';
const STORE_NAME = 'app_state';
const DB_VERSION = 1;

const canUseIndexedDB = () => typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = 2000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('IndexedDB timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
const safeLocalStorageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string): boolean => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Quota/security errors are expected in some environments; report failure to caller.
    return false;
  }
};

const safeLocalStorageRemove = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

/** Only database opening is timed out; transactions converge via completion/error/abort events. */
const openDb = (): Promise<IDBDatabase> => withTimeout(new Promise<IDBDatabase>((resolve, reject) => {
  const request = window.indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
}), 2000);
const idbGet = async (key: string): Promise<string | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);

    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('[storage] IndexedDB transaction aborted')); };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const idbSet = async (key: string, value: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const idbDelete = async (key: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};


const idbSetMany = async (entries: ReadonlyArray<readonly [string, string]>): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const [key, value] of entries) store.put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('[storage] IndexedDB batch transaction aborted')); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const idbGetMany = async (keys: ReadonlyArray<string>): Promise<Array<string | null>> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const results: Array<string | null> = new Array(keys.length).fill(null);
    keys.forEach((key, index) => {
      const request = store.get(key);
      request.onsuccess = () => { results[index] = (request.result as string | undefined) ?? null; };
      request.onerror = () => reject(request.error);
    });
    tx.oncomplete = () => { db.close(); resolve(results); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('[storage] IndexedDB batch read transaction aborted')); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const idbHasKey = async (key: string): Promise<boolean> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getKey(key);
    request.onsuccess = () => resolve(request.result !== undefined);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('[storage] IndexedDB transaction aborted')); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const idbDeleteWithDerivedKeys = async (name: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(name);
    if (typeof IDBKeyRange !== 'undefined') store.delete(IDBKeyRange.bound(name + '#', name + '#\uffff'));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('[storage] IndexedDB delete transaction aborted')); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const safeLocalStorageRemoveByPrefix = (prefix: string): void => {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index--) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
};

const safeLocalStorageRemoveWithDerivedKeys = (name: string): void => {
  safeLocalStorageRemove(name);
  safeLocalStorageRemoveByPrefix(name + '#');
};

const fallbackMarkerKey = (name: string): string => name + '#fallback';
const isFallbackAuthoritative = (name: string): boolean => safeLocalStorageGet(fallbackMarkerKey(name)) !== null;

const hasFallbackDerivedKeys = (name: string): boolean => {
  const marker = fallbackMarkerKey(name);
  try {
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (key && key !== marker && key.startsWith(name + '#')) return true;
    }
  } catch {
    return true;
  }
  return false;
};

export const writeEntriesToFallbackStorage = async (
  name: string,
  entries: ReadonlyArray<readonly [string, string]>,
): Promise<void> => {
  const written: Array<readonly [string, string | null]> = [];
  try {
    for (const [key, value] of entries) {
      const previous = safeLocalStorageGet(key);
      if (!safeLocalStorageSet(key, value)) throw new Error('[storage] localStorage fallback write failed');
      written.push([key, previous]);
    }
  } catch (error) {
    for (let index = written.length - 1; index >= 0; index--) {
      const [key, previous] = written[index];
      if (previous === null) safeLocalStorageRemove(key);
      else safeLocalStorageSet(key, previous);
    }
    throw error;
  }
  if (!safeLocalStorageSet(fallbackMarkerKey(name), new Date().toISOString())) {
    for (let index = written.length - 1; index >= 0; index--) {
      const [key, previous] = written[index];
      if (previous === null) safeLocalStorageRemove(key);
      else safeLocalStorageSet(key, previous);
    }
    throw new Error('[storage] localStorage fallback marker write failed');
  }
  if (canUseIndexedDB()) {
    for (const [key] of entries) {
      try { await idbDelete(key); } catch { /* stale IDB is ignored while marker is authoritative */ }
    }
  }
};

export const setStorageEntries = async (
  name: string,
  entries: ReadonlyArray<readonly [string, string]>,
): Promise<void> => {
  if (typeof window === 'undefined' || entries.length === 0) return;
  if (canUseIndexedDB()) {
    try {
      await idbSetMany(entries);
      for (const [key] of entries) safeLocalStorageRemove(key);
      if (!hasFallbackDerivedKeys(name)) safeLocalStorageRemove(fallbackMarkerKey(name));
      return;
    } catch (error) {
      console.warn('[storage] IndexedDB batch set failed, fallback to localStorage:', error);
    }
  }
  await writeEntriesToFallbackStorage(name, entries);
};

export const getStorageItemStrict = async (name: string, key: string): Promise<string | null> => {
  if (typeof window === 'undefined' || !canUseIndexedDB()) return safeLocalStorageGet(key);
  const fallbackAuthoritative = isFallbackAuthoritative(name);
  try {
    const value = await idbGet(key);
    if (value !== null) return fallbackAuthoritative ? (safeLocalStorageGet(key) ?? value) : value;
    return safeLocalStorageGet(key);
  } catch (error) {
    if (fallbackAuthoritative) return safeLocalStorageGet(key);
    throw error;
  }
};

export const getStorageEntriesStrict = async (
  name: string,
  keys: ReadonlyArray<string>,
): Promise<Array<string | null>> => {
  if (typeof window === 'undefined' || !canUseIndexedDB()) return keys.map((key) => safeLocalStorageGet(key));
  const fallbackAuthoritative = isFallbackAuthoritative(name);
  try {
    const values = await idbGetMany(keys);
    return keys.map((key, index) => {
      const fallback = safeLocalStorageGet(key);
      return fallbackAuthoritative ? (fallback ?? values[index]) : (values[index] ?? fallback);
    });
  } catch (error) {
    if (fallbackAuthoritative) return keys.map((key) => safeLocalStorageGet(key));
    throw error;
  }
};
export const hasLegacySnapshot = async (name: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (safeLocalStorageGet(name) !== null) return true;
  if (!canUseIndexedDB()) return false;
  try { return await idbHasKey(name); } catch { return false; }
};

export const removeLegacySnapshot = async (name: string): Promise<void> => {
  if (typeof window === 'undefined') return;
  safeLocalStorageRemove(name);
  if (canUseIndexedDB()) {
    try { await idbDelete(name); } catch (error) { console.warn('[storage] legacy snapshot remove failed:', error); }
  }
};

/**
 * IndexedDB-backed Zustand persist storage with seamless migration:
 * - First read from IndexedDB
 * - If empty, migrate an existing localStorage snapshot to IndexedDB and then remove it
 * - Normal writes go to IndexedDB and clear any legacy localStorage snapshot.
 * - localStorage is only kept as the current snapshot when IndexedDB is unavailable or a write fails.
 *   This avoids stale fallback rollbacks while preserving persistence in constrained environments.
 */
export const indexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;

    // Hard fallback for environments without IndexedDB
    if (!canUseIndexedDB()) {
      return safeLocalStorageGet(name);
    }

    try {
      const idbValue = await withTimeout(idbGet(name));
      if (idbValue !== null) return idbValue;

      // Migration path: restore existing localStorage snapshot into IndexedDB
      const legacyValue = safeLocalStorageGet(name);
      if (legacyValue !== null) {
        await withTimeout(idbSet(name, legacyValue));
        safeLocalStorageRemove(name);
        console.info('[storage] migrated state from localStorage to IndexedDB');
      }
      return legacyValue;
    } catch (error) {
      console.warn('[storage] IndexedDB get failed, fallback to localStorage:', error);
      return safeLocalStorageGet(name);
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;

    // Primary path: IndexedDB first (large data friendly)
    if (canUseIndexedDB()) {
      try {
        await withTimeout(idbSet(name, value));
        safeLocalStorageRemove(name);
        return;
      } catch (error) {
        console.warn('[storage] IndexedDB set failed, fallback to localStorage:', error);
      }
    }

    if (!safeLocalStorageSet(name, value)) {
      throw new Error('[storage] localStorage fallback write failed');
    }
  },

  removeItem: async (name: string): Promise<void> => {
    if (typeof window === 'undefined') return;

    safeLocalStorageRemoveWithDerivedKeys(name);

    if (!canUseIndexedDB()) return;

    await idbDeleteWithDerivedKeys(name);
  },
};
