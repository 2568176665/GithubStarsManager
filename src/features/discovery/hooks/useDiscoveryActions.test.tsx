import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiscoveryActions } from './useDiscoveryActions';
import { useAppStore } from '../../../store/useAppStore';
import type { Repository } from '../../../types';

const mocks = vi.hoisted(() => ({
  useAppStore: vi.fn(),
  runAnalysis: vi.fn(),
  requestAnalysisStop: vi.fn(),
  useRepositoryAnalysisJob: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: mocks.useAppStore,
  getAllCategories: vi.fn(() => []),
}));

vi.mock('../../../hooks/useDialog', () => ({
  useDialog: () => ({ toast: mocks.toast, confirm: vi.fn() }),
}));

vi.mock('../../repositories/hooks/useRepositoryAnalysisJob', () => ({
  useRepositoryAnalysisJob: mocks.useRepositoryAnalysisJob,
}));

vi.mock('../../lifecycle/useAuthSessionGeneration', () => ({
  useAuthSessionGeneration: () => ({
    captureSession: () => ({ generation: 1 }),
    isCurrentSession: () => true,
  }),
}));

const repository = (id: number, analyzed_at?: string): Repository => ({
  id,
  name: `repo-${id}`,
  full_name: `owner/repo-${id}`,
  description: null,
  html_url: `https://github.com/owner/repo-${id}`,
  stargazers_count: 1,
  forks_count: 0,
  forks: 0,
  language: 'TypeScript',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  pushed_at: '2026-01-03T00:00:00.000Z',
  owner: { login: 'owner', avatar_url: '' },
  topics: [],
  analyzed_at,
});

const state = {
  githubToken: 'github-token',
  language: 'zh' as const,
  customCategories: [],
  hiddenDefaultCategoryIds: [],
  defaultCategoryOverrides: {},
  discoveryChannels: [],
  discoveryRepos: {
    trending: [repository(1), repository(2, '2026-01-01T00:00:00.000Z')],
    'hot-release': [],
    'most-popular': [],
    topic: [],
    search: [],
  },
  discoveryLastRefresh: {},
  discoveryIsLoading: {},
  discoveryIsLoadingMore: {},
  discoveryLoadMoreError: {},
  selectedDiscoveryChannel: 'trending' as const,
  discoveryPlatform: 'all' as const,
  trendingTimeRange: 'daily' as const,
  discoverySelectedTopic: null,
  discoverySearchQuery: '',
  discoveryLanguage: 'all' as const,
  discoverySortBy: 'stars' as const,
  discoverySortOrder: 'desc' as const,
  analysisProgress: { current: 0, total: 0 },
};

const mockUseAppStore = vi.mocked(useAppStore);

describe('useDiscoveryActions AI analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useRepositoryAnalysisJob.mockReturnValue({
      run: mocks.runAnalysis,
      requestStop: mocks.requestAnalysisStop,
      isRunning: false,
    });
    mocks.runAnalysis.mockResolvedValue(true);
    mockUseAppStore.mockImplementation(((selector?: (value: typeof state) => unknown) => (
      selector ? selector(state) : state
    )) as typeof useAppStore);
  });

  it('delegates trend analysis to the shared repository analysis job', async () => {
    const { result } = renderHook(() => useDiscoveryActions({ current: null }));

    await act(async () => {
      await result.current.handleAnalyzePage();
    });

    expect(mocks.runAnalysis).toHaveBeenCalledWith({
      repositories: [state.discoveryRepos.trending[0]],
      scope: 'all',
      syncOnComplete: false,
    });
  });
});
