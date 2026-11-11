import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Release } from '../types';
import {
  POLL_INTERVAL,
  loadDeferredReleases,
  resetSyncHashes,
  startAutoSync,
  stopAutoSync,
  syncFromBackend,
} from './autoSync';
import { backend } from './backendAdapter';
import { useAppStore } from '../store/useAppStore';

vi.mock('./backendAdapter', () => ({
  backend: {
    isAvailable: true,
    fetchRepositories: vi.fn(),
    fetchReleases: vi.fn(),
    fetchAIConfigs: vi.fn(),
    fetchWebDAVConfigs: vi.fn(),
    fetchEmbeddingConfigs: vi.fn(),
    fetchVectorSearchConfig: vi.fn(),
    fetchSettings: vi.fn(),
    syncRepositories: vi.fn().mockResolvedValue(undefined),
    syncReleases: vi.fn().mockResolvedValue(undefined),
    syncAIConfigs: vi.fn().mockResolvedValue(undefined),
    syncWebDAVConfigs: vi.fn().mockResolvedValue(undefined),
    syncEmbeddingConfigs: vi.fn().mockResolvedValue(undefined),
    syncVectorSearchConfig: vi.fn().mockResolvedValue(undefined),
    syncSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

// syncFromBackend drives the real store (setReleases, getState), so restore the
// actual module instead of the component-level store mock.
vi.mock('../store/useAppStore', async () => await vi.importActual('../store/useAppStore'));

const createRelease = (id: number): Release => ({
  id,
  tag_name: `v${id}`,
  name: `Release ${id}`,
  body: '',
  published_at: '2026-01-01T00:00:00.000Z',
  html_url: `https://github.com/owner/repo/releases/tag/v${id}`,
  assets: [],
  zipball_url: 'https://api.github.com/repos/owner/repo/zipball/v1',
  tarball_url: 'https://api.github.com/repos/owner/repo/tarball/v1',
  prerelease: false,
  repository: { id: 1, name: 'repo-1', full_name: 'owner/repo-1' },
});

// The deferred-collection registry lives for one page load, exactly like in the
// browser, so the cases below run in order: the early ones observe a client that
// has not demanded releases yet, the later ones a client that has.
describe('deferred collection loading (releases)', () => {
  let originalState: ReturnType<typeof useAppStore.getState>;
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    originalState = useAppStore.getState();
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });

    vi.mocked(backend.fetchRepositories).mockResolvedValue({ repositories: [], total: 0 });
    vi.mocked(backend.fetchReleases).mockResolvedValue({ releases: [], total: 0 });
    vi.mocked(backend.fetchAIConfigs).mockResolvedValue([]);
    vi.mocked(backend.fetchWebDAVConfigs).mockResolvedValue([]);
    vi.mocked(backend.fetchEmbeddingConfigs).mockResolvedValue([]);
    vi.mocked(backend.fetchVectorSearchConfig).mockResolvedValue({
      enabled: false,
      workerUrl: '',
      authToken: '',
      embeddingConfigId: '',
      indexMode: 'readme',
      readmeMaxChars: 6000,
    });
    vi.mocked(backend.fetchSettings).mockResolvedValue({});
    resetSyncHashes();
    useAppStore.setState({ repositories: [], releases: [] });
  });

  afterEach(() => {
    if (unsubscribe) {
      stopAutoSync(unsubscribe);
      unsubscribe = null;
    }
    vi.useRealTimers();
    useAppStore.setState(originalState);
  });

  it('keeps releases out of the startup pull and out of polls while nothing demands them', async () => {
    unsubscribe = startAutoSync();

    await syncFromBackend();
    expect(backend.fetchRepositories).toHaveBeenCalledOnce();
    expect(backend.fetchReleases).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    expect(backend.fetchRepositories).toHaveBeenCalledTimes(2);
    expect(backend.fetchReleases).not.toHaveBeenCalled();
  });

  it('loads releases on demand and applies them to the store', async () => {
    const releases = [createRelease(1), createRelease(2)];
    vi.mocked(backend.fetchReleases).mockResolvedValue({ releases, total: 2 });

    await loadDeferredReleases();

    expect(backend.fetchReleases).toHaveBeenCalledOnce();
    expect(useAppStore.getState().releases).toHaveLength(2);
  });

  it('never lets an empty backend copy wipe releases restored from the local cache', async () => {
    const localReleases = [createRelease(7)];
    useAppStore.setState({ releases: localReleases });
    vi.mocked(backend.fetchReleases).mockResolvedValue({ releases: [], total: 0 });

    await loadDeferredReleases();

    expect(useAppStore.getState().releases).toEqual(localReleases);
  });

  it('refreshes releases in every later poll once they were demanded', async () => {
    unsubscribe = startAutoSync();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);

    expect(backend.fetchRepositories).toHaveBeenCalledOnce();
    expect(backend.fetchReleases).toHaveBeenCalledOnce();
  });

  it('forced pulls still include releases', async () => {
    await syncFromBackend({ force: true });

    expect(backend.fetchReleases).toHaveBeenCalledOnce();
  });
});
