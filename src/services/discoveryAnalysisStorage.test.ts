import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoveryAnalysisStorage, type DiscoveryAnalysisData } from './discoveryAnalysisStorage';

type RequestHandler = (() => void) | null;

class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: RequestHandler = null;
  onerror: RequestHandler = null;
}

class FakeTransaction {
  oncomplete: RequestHandler = null;
  onerror: RequestHandler = null;
  onabort: RequestHandler = null;
  private pending = 0;
  private completionQueued = false;

  schedule(operation: () => void): void {
    this.pending += 1;
    queueMicrotask(() => {
      try {
        operation();
      } catch (error) {
        this.error = error instanceof Error ? error : new Error(String(error));
        this.onerror?.();
      }
      this.pending -= 1;
      this.completeIfIdle();
    });
  }

  error: Error | null = null;

  completeIfIdle(): void {
    if (this.pending !== 0 || this.completionQueued) return;
    this.completionQueued = true;
    queueMicrotask(() => this.oncomplete?.());
  }
}

class FakeObjectStore {
  constructor(private readonly values: Map<number, string>, private readonly transaction: FakeTransaction) {}

  clear(): void {
    this.transaction.schedule(() => this.values.clear());
  }

  put(value: string, key: number): void {
    this.transaction.schedule(() => this.values.set(key, value));
  }

  openCursor(): FakeRequest<IDBCursorWithValue | null> {
    const request = new FakeRequest<IDBCursorWithValue | null>();
    const keys = [...this.values.keys()].sort((left, right) => left - right);
    let index = 0;
    const emit = () => {
      const key = keys[index++];
      if (key === undefined) {
        request.result = null;
        request.onsuccess?.();
        this.transaction.completeIfIdle();
        return;
      }
      request.result = {
        key,
        value: this.values.get(key),
        continue: () => queueMicrotask(emit),
      } as unknown as IDBCursorWithValue;
      request.onsuccess?.();
    };
    queueMicrotask(emit);
    return request;
  }
}

class FakeDatabase {
  readonly values = new Map<number, string>();
  readonly objectStoreNames = { contains: (name: string) => name === 'analysis' };

  createObjectStore(): FakeObjectStore {
    return new FakeObjectStore(this.values, new FakeTransaction());
  }

  transaction(): FakeTransaction & { objectStore: (name: string) => FakeObjectStore } {
    const transaction = new FakeTransaction() as FakeTransaction & { objectStore: (name: string) => FakeObjectStore };
    transaction.objectStore = () => new FakeObjectStore(this.values, transaction);
    return transaction;
  }

  close(): void {}
}

class FakeIndexedDB {
  readonly database = new FakeDatabase();

  open(): IDBOpenDBRequest {
    const request = new FakeRequest<IDBDatabase>() as FakeRequest<IDBDatabase> & IDBOpenDBRequest;
    queueMicrotask(() => {
      request.result = this.database as unknown as IDBDatabase;
      request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent);
      request.onsuccess?.(new Event('success'));
    });
    return request;
  }
}

const analysis = (summary: string): DiscoveryAnalysisData => ({ ai_summary: summary, analyzed_at: '2026-09-30T00:00:00.000Z' });

describe('discoveryAnalysisStorage backup snapshot', () => {
  let fakeIndexedDB: FakeIndexedDB;

  beforeEach(() => {
    fakeIndexedDB = new FakeIndexedDB();
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: fakeIndexedDB });
  });

  afterEach(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  });

  it('returns an empty snapshot distinctly from an unavailable database', async () => {
    await expect(discoveryAnalysisStorage.exportAllAnalyses()).resolves.toEqual({});

    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
    await expect(discoveryAnalysisStorage.exportAllAnalyses()).rejects.toThrow('unavailable');
  });

  it('merges by repo id and replaces atomically', async () => {
    await discoveryAnalysisStorage.restoreAllAnalyses({ '1': analysis('old'), '2': analysis('keep') }, 'merge');
    await discoveryAnalysisStorage.restoreAllAnalyses({ '1': analysis('new') }, 'merge');
    await expect(discoveryAnalysisStorage.exportAllAnalyses()).resolves.toMatchObject({
      '1': analysis('new'),
      '2': analysis('keep'),
    });

    await discoveryAnalysisStorage.restoreAllAnalyses({ '3': analysis('replacement') }, 'replace');
    await expect(discoveryAnalysisStorage.exportAllAnalyses()).resolves.toEqual({ '3': analysis('replacement') });
  });
});
