import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_SYNC_ON_VISIBLE_INTERVAL, POLL_INTERVAL, startAutoSync, stopAutoSync } from './autoSync';
import { backend } from './backendAdapter';

vi.mock('./backendAdapter', () => ({
  backend: {
    isAvailable: true,
    fetchRepositories: vi.fn(async () => ({ repositories: [], total: 0 })),
    fetchReleases: vi.fn(async () => ({ releases: [], total: 0 })),
    fetchAIConfigs: vi.fn(async () => []),
    fetchWebDAVConfigs: vi.fn(async () => []),
    fetchEmbeddingConfigs: vi.fn(async () => []),
    fetchVectorSearchConfig: vi.fn(async () => ({})),
    fetchSettings: vi.fn(async () => ({})),
    fetchDiscoveryAnalyses: vi.fn(async () => ({})),
  },
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      repositories: [],
      releases: [],
      aiConfigs: [],
      webdavConfigs: [],
      embeddingConfigs: [],
      vectorSearchConfig: {},
    })),
    setState: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

describe('autoSync visibility and foreground polling', () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (unsubscribe) {
      stopAutoSync(unsubscribe);
    }
    vi.useRealTimers();
  });

  it('uses 30s polling interval and does not poll when document is hidden', async () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true });
    unsubscribe = startAutoSync();

    // Advance by 30 seconds while hidden
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);

    // No background fetches should have occurred
    expect(backend.fetchRepositories).not.toHaveBeenCalled();

    // Switch tab to visible
    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(backend.fetchRepositories).toHaveBeenCalledOnce();
  });

  it('throttles rapid visibility or focus switches within MIN_SYNC_ON_VISIBLE_INTERVAL', async () => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
    unsubscribe = startAutoSync();

    // First visible event triggers sync
    document.dispatchEvent(new Event('visibilitychange'));
    expect(backend.fetchRepositories).toHaveBeenCalledOnce();

    // Immediate second event within throttle interval should be ignored
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(backend.fetchRepositories).toHaveBeenCalledOnce();

    // Advance past throttle window
    await vi.advanceTimersByTimeAsync(MIN_SYNC_ON_VISIBLE_INTERVAL + 100);
    window.dispatchEvent(new Event('focus'));
    expect(backend.fetchRepositories).toHaveBeenCalledTimes(2);
  });

  it('polls periodically when document is visible', async () => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
    unsubscribe = startAutoSync();

    expect(backend.fetchRepositories).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    expect(backend.fetchRepositories).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    expect(backend.fetchRepositories).toHaveBeenCalledTimes(2);
  });

  it('cleans up interval and listeners when stopAutoSync is called', async () => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
    unsubscribe = startAutoSync();

    stopAutoSync(unsubscribe);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 2);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));

    expect(backend.fetchRepositories).not.toHaveBeenCalled();
  });
});
