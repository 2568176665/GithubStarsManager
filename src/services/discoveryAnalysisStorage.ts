export interface DiscoveryAnalysisData {
  ai_summary?: string;
  ai_tags?: string[];
  ai_platforms?: string[];
  analyzed_at?: string;
  analysis_failed?: boolean;
  analysis_error?: string;
}

export type DiscoveryAnalysisRecord = Record<string, DiscoveryAnalysisData>;

export type DiscoveryAnalysisRestoreMode = 'merge' | 'replace';

const DB_NAME = 'github-stars-discovery-analysis';
const STORE_NAME = 'analysis';
const DB_VERSION = 1;

const canUseIndexedDB = (): boolean =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs = 3000,
  onLate?: (value: T) => void
): Promise<T> => {
  let isSettled = false;

  const wrappedPromise = promise
    .then((value) => {
      if (isSettled && onLate) {
        onLate(value);
      }
      return value;
    })
    .catch((error) => {
      if (isSettled && onLate) {
        console.warn('[discoveryAnalysisStorage] Late error after timeout:', error);
      }
      throw error;
    });

  const timeoutPromise = new Promise<T>((_, reject) =>
    setTimeout(() => {
      isSettled = true;
      reject(new Error('DiscoveryAnalysisStorage timeout'));
    }, timeoutMs)
  );

  return await Promise.race([wrappedPromise, timeoutPromise]);
};

const indexedDbUnavailable = (): Error => new Error('Discovery analysis IndexedDB is unavailable');

const parseAnalysisRecord = (key: IDBValidKey, raw: unknown): DiscoveryAnalysisData => {
  if (typeof raw !== 'string') {
    throw new Error(`Invalid discovery analysis record for ${String(key)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid discovery analysis record for ${String(key)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid discovery analysis record for ${String(key)}`);
  }
  return parsed as DiscoveryAnalysisData;
};

const normalizeAnalysisEntries = (analyses: DiscoveryAnalysisRecord): Array<[number, string]> => {
  return Object.entries(analyses).map(([repoId, data]) => {
    const numericRepoId = Number(repoId);
    if (!Number.isSafeInteger(numericRepoId) || numericRepoId < 0) {
      throw new Error(`Invalid discovery analysis repository id: ${repoId}`);
    }
    return [numericRepoId, JSON.stringify(data)] as [number, string];
  });
};

const readAllAnalysesStrict = async (db: IDBDatabase): Promise<DiscoveryAnalysisRecord> => {
  return await new Promise<DiscoveryAnalysisRecord>((resolve, reject) => {
    const result: DiscoveryAnalysisRecord = {};
    let tx: IDBTransaction;
    let request: IDBRequest<IDBCursorWithValue | null>;
    try {
      tx = db.transaction(STORE_NAME, 'readonly');
      request = tx.objectStore(STORE_NAME).openCursor();
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    let settled = false;

    const close = () => db.close();
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      close();
      reject(error instanceof Error ? error : new Error('Failed to read discovery analyses'));
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      try {
        result[String(cursor.key)] = parseAnalysisRecord(cursor.key, cursor.value);
        cursor.continue();
      } catch (error) {
        fail(error);
      }
    };
    request.onerror = () => fail(request.error);
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      close();
      resolve(result);
    };
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error ?? new Error('Discovery analysis read aborted'));
  });
};

const writeAllAnalysesStrict = async (
  db: IDBDatabase,
  entries: Array<[number, string]>,
  mode: DiscoveryAnalysisRestoreMode,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    let store: IDBObjectStore;
    try {
      tx = db.transaction(STORE_NAME, 'readwrite');
      store = tx.objectStore(STORE_NAME);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    let settled = false;

    const close = () => db.close();
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      close();
      reject(error instanceof Error ? error : new Error('Failed to restore discovery analyses'));
    };

    try {
      if (mode === 'replace') store.clear();
      entries.forEach(([repoId, raw]) => store.put(raw, repoId));
    } catch (error) {
      fail(error);
      return;
    }

    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      close();
      resolve();
    };
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error ?? new Error('Discovery analysis restore aborted'));
  });
};

export const discoveryAnalysisStorage = {
  /** Strict snapshot read for backups: an empty object is a valid empty snapshot; failures reject. */
  async exportAllAnalyses(): Promise<DiscoveryAnalysisRecord> {
    if (!canUseIndexedDB()) throw indexedDbUnavailable();
    const db = await withTimeout(openDb(), 3000, (lateDb) => lateDb.close());
    return await readAllAnalysesStrict(db);
  },

  /** Strict restore for backups. Replace is atomic and clears records before writing the snapshot. */
  async restoreAllAnalyses(
    analyses: DiscoveryAnalysisRecord,
    mode: DiscoveryAnalysisRestoreMode = 'merge',
  ): Promise<void> {
    if (!canUseIndexedDB()) throw indexedDbUnavailable();
    if (mode !== 'merge' && mode !== 'replace') {
      throw new Error(`Invalid discovery analysis restore mode: ${mode}`);
    }
    const entries = normalizeAnalysisEntries(analyses);
    const db = await withTimeout(openDb(), 3000, (lateDb) => lateDb.close());
    await writeAllAnalysesStrict(db, entries, mode);
  },

  async saveAnalysis(repoId: number, data: DiscoveryAnalysisData): Promise<void> {
    if (!canUseIndexedDB()) return;
    try {
      const db = await withTimeout(openDb(), 3000, (lateDb) => lateDb.close());
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(JSON.stringify(data), repoId);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch (e) {
      console.warn('[discoveryAnalysisStorage] saveAnalysis failed:', e);
    }
  },

  async loadAnalysis(repoId: number): Promise<DiscoveryAnalysisData | null> {
    if (!canUseIndexedDB()) return null;
    try {
      const db = await withTimeout(openDb(), 3000, (lateDb) => lateDb.close());
      return await new Promise<DiscoveryAnalysisData | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(repoId);

        req.onsuccess = () => {
          const raw = req.result as string | undefined;
          if (!raw) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(raw) as DiscoveryAnalysisData);
          } catch {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch (e) {
      console.warn('[discoveryAnalysisStorage] loadAnalysis failed:', e);
      return null;
    }
  },

  async loadAllAnalyses(): Promise<Map<number, DiscoveryAnalysisData>> {
    const result = new Map<number, DiscoveryAnalysisData>();
    if (!canUseIndexedDB()) return result;

    try {
      const db = await withTimeout(openDb(), 3000, (lateDb) => lateDb.close());
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).openCursor();

        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve();
            return;
          }
          const key = cursor.key as number;
          const raw = cursor.value as string;
          try {
            result.set(key, JSON.parse(raw) as DiscoveryAnalysisData);
          } catch {
            // skip corrupted entries
          }
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch (e) {
      console.warn('[discoveryAnalysisStorage] loadAllAnalyses failed:', e);
    }

    return result;
  },

  async saveAllAnalyses(analyses: DiscoveryAnalysisRecord): Promise<void> {
    await Promise.all(Object.entries(analyses).map(([repoId, data]) => this.saveAnalysis(Number(repoId), data)));
  },

  async deleteAnalysis(repoId: number): Promise<void> {
    if (!canUseIndexedDB()) return;
    try {
      const db = await withTimeout(openDb(), 3000, (lateDb) => lateDb.close());
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(repoId);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch (e) {
      console.warn('[discoveryAnalysisStorage] deleteAnalysis failed:', e);
    }
  },
};
