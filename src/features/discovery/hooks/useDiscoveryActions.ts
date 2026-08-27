import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DiscoveryChannelId, DiscoveryRepo, PaginatedDiscoveryRepositories } from '../../../types';
import { useAppStore, getAllCategories } from '../../../store/useAppStore';
import { selectDiscoveryViewState } from '../../../store/selectors';
import { GitHubApiService } from '../../../services/githubApi';
import { discoveryAnalysisStorage } from '../../../services/discoveryAnalysisStorage';
import type { AnalysisResult } from '../../../services/aiAnalysisOptimizer';
import { useDialog } from '../../../hooks/useDialog';
import { useAuthSessionGeneration } from '../../lifecycle/useAuthSessionGeneration';
import {
  useRepositoryAnalysisJob,
  type RepositoryAnalysisResultContext,
} from '../../repositories/hooks/useRepositoryAnalysisJob';

const getChannelRequestSignature = (state: ReturnType<typeof selectDiscoveryViewState>, channelId: DiscoveryChannelId) => {
  const common = [state.githubToken, state.discoveryPlatform];
  switch (channelId) {
    case 'trending': return JSON.stringify([...common, state.trendingTimeRange]);
    case 'topic': return JSON.stringify([...common, state.discoverySelectedTopic]);
    case 'search': return JSON.stringify([...common, state.discoverySearchQuery, state.discoveryLanguage, state.discoverySortBy, state.discoverySortOrder]);
    default: return JSON.stringify(common);
  }
};

/**
 * Owns network-backed Discovery loading and delegates AI analysis to the same
 * repository analysis job used by the main repository list.
 */
export const useDiscoveryActions = (scrollContainerRef: RefObject<HTMLDivElement | null>) => {
  const state = useAppStore(useShallow(selectDiscoveryViewState));
  const { toast } = useDialog();
  const channelRequestVersionRef = useRef<Partial<Record<DiscoveryChannelId, number>>>({});
  const channelLoadingVersionRef = useRef<Record<string, number>>({});
  const latestStateRef = useRef(state);
  const analysisTargetRef = useRef<{ channel: DiscoveryChannelId; platform: typeof state.discoveryPlatform } | null>(null);
  const analysisSessionRef = useRef<ReturnType<typeof captureSession> | null>(null);
  const authSessionIdentity = useAppStore(current => `${current.githubToken ?? ''}\u0000${current.user?.id ?? ''}\u0000${current.user?.login ?? ''}`);
  const { captureSession, isCurrentSession } = useAuthSessionGeneration(authSessionIdentity);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const t = useCallback((zh: string, en: string) => state.language === 'zh' ? zh : en, [state.language]);

  const allCategories = useMemo(
    () => getAllCategories(
      state.customCategories,
      state.language,
      state.hiddenDefaultCategoryIds,
      state.defaultCategoryOverrides,
    ),
    [
      state.customCategories,
      state.language,
      state.hiddenDefaultCategoryIds,
      state.defaultCategoryOverrides,
    ],
  );

  const handleAnalysisResult = useCallback((result: AnalysisResult, context: RepositoryAnalysisResultContext) => {
    const target = analysisTargetRef.current;
    const session = analysisSessionRef.current;
    if (!target || !session || !isCurrentSession(session) || !result.repo) return;

    const baseRepo = result.repo as DiscoveryRepo;
    if (result.success) {
      const updatedRepo: DiscoveryRepo = {
        ...baseRepo,
        rank: 0,
        channel: target.channel,
        platform: target.platform,
        ai_summary: result.summary,
        ai_tags: result.tags,
        ai_platforms: result.platforms,
        custom_category: context.resolvedCategory,
        category_locked: !!baseRepo.category_locked,
        analyzed_at: context.analyzedAt,
        analysis_failed: false,
        analysis_error: undefined,
      };
      useAppStore.getState().updateDiscoveryRepo(updatedRepo);
      void discoveryAnalysisStorage.saveAnalysis(updatedRepo.id, {
        ai_summary: result.summary,
        ai_tags: result.tags,
        ai_platforms: result.platforms,
        analyzed_at: context.analyzedAt,
        analysis_failed: false,
        analysis_error: undefined,
      });
      return;
    }

    const failedRepo: DiscoveryRepo = {
      ...baseRepo,
      rank: 0,
      channel: target.channel,
      platform: target.platform,
      analyzed_at: context.analyzedAt,
      analysis_failed: true,
      analysis_error: result.error?.message || undefined,
    };
    useAppStore.getState().updateDiscoveryRepo(failedRepo);
    void discoveryAnalysisStorage.saveAnalysis(failedRepo.id, {
      analyzed_at: context.analyzedAt,
      analysis_failed: true,
      analysis_error: failedRepo.analysis_error,
    });
  }, [isCurrentSession]);

  const {
    run: runAnalysis,
    requestStop: requestAnalysisStop,
    isRunning: isAnalysisRunning,
  } = useRepositoryAnalysisJob({ allCategories, onAnalysisResult: handleAnalysisResult });

  const refreshChannel = useCallback(async (channelId: DiscoveryChannelId, page = 1, append = false) => {
    const currentState = latestStateRef.current;
    if (!currentState.githubToken) {
      toast(t('GitHub token not found. Please login again.', 'GitHub token not found. Please login again.'), 'error');
      return;
    }
    const requestVersion = (channelRequestVersionRef.current[channelId] ?? 0) + 1;
    channelRequestVersionRef.current[channelId] = requestVersion;
    const loadingKey = `${channelId}:${append ? 'append' : 'initial'}`;
    channelLoadingVersionRef.current[loadingKey] = requestVersion;
    const requestSession = captureSession();
    const requestSignature = getChannelRequestSignature(currentState, channelId);
    const isCurrentRequest = () => channelRequestVersionRef.current[channelId] === requestVersion
      && isCurrentSession(requestSession)
      && getChannelRequestSignature(useAppStore.getState(), channelId) === requestSignature;
    const ownsLoading = () => channelLoadingVersionRef.current[loadingKey] === requestVersion;

    if (append) {
      currentState.setDiscoveryLoadingMore(channelId, true);
      currentState.setDiscoveryLoadMoreError(channelId, null);
    } else {
      currentState.setDiscoveryLoading(channelId, true);
    }
    try {
      const api = new GitHubApiService(currentState.githubToken);
      let result: PaginatedDiscoveryRepositories;
      switch (channelId) {
        case 'trending':
          result = await api.getTrendingRepositories(currentState.discoveryPlatform, page, 20, currentState.trendingTimeRange);
          break;
        case 'hot-release':
          result = await api.getHotReleaseRepositories(currentState.discoveryPlatform, page);
          break;
        case 'most-popular':
          result = await api.getMostPopular(currentState.discoveryPlatform, page);
          break;
        case 'topic':
          result = currentState.discoverySelectedTopic
            ? await api.getTopicRepositories(currentState.discoverySelectedTopic, currentState.discoveryPlatform, page)
            : await api.getTrendingRepositories(currentState.discoveryPlatform, page);
          break;
        case 'search':
          result = currentState.discoverySearchQuery.trim()
            ? await api.searchRepositories(currentState.discoverySearchQuery, currentState.discoveryPlatform, currentState.discoveryLanguage, currentState.discoverySortBy, currentState.discoverySortOrder, page)
            : { repos: [], hasMore: false, nextPageIndex: page + 1, totalCount: 0 };
          break;
        default:
          result = { repos: [], hasMore: false, nextPageIndex: page + 1, totalCount: 0 };
      }
      if (!isCurrentRequest()) return;
      const current = useAppStore.getState();
      const previousCount = current.discoveryRepos[channelId]?.length ?? 0;
      const currentRepos = current.discoveryRepos[channelId] || [];
      const persistedAnalyses = await discoveryAnalysisStorage.loadAllAnalyses();
      if (!isCurrentRequest()) return;
      const mergedRepos = result.repos.map((newRepo) => {
        const existing = currentRepos.find(item => item.id === newRepo.id);
        const analysis = existing?.analyzed_at ? existing : persistedAnalyses.get(newRepo.id);
        return analysis?.analyzed_at ? {
          ...newRepo,
          ai_summary: analysis.ai_summary,
          ai_tags: analysis.ai_tags,
          ai_platforms: analysis.ai_platforms,
          analyzed_at: analysis.analyzed_at,
          analysis_failed: analysis.analysis_failed,
          analysis_error: analysis.analysis_error,
        } : newRepo;
      });
      if (append) currentState.appendDiscoveryRepos(channelId, mergedRepos);
      else currentState.setDiscoveryRepos(channelId, mergedRepos);
      currentState.setDiscoveryHasMore(channelId, result.hasMore);
      currentState.setDiscoveryNextPage(channelId, result.nextPageIndex);
      if (result.totalCount !== undefined) currentState.setDiscoveryTotalCount(channelId, result.totalCount);
      currentState.setDiscoveryLastRefresh(channelId, new Date().toISOString());
      if (append && scrollContainerRef.current) {
        requestAnimationFrame(() => {
          const cards = scrollContainerRef.current?.querySelectorAll('[data-repo-index]');
          const target = cards?.[previousCount] as HTMLElement | undefined;
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error(`Failed to refresh channel ${channelId}:`, error);
      if (append) currentState.setDiscoveryLoadMoreError(channelId, t('鍔犺浇鏇村澶辫触锛岃閲嶈瘯', 'Failed to load more, please retry'));
      else toast(t('Failed to fetch data. Please check your network connection or GitHub Token.', 'Failed to fetch data. Please check your network connection or GitHub Token.'), 'error');
    } finally {
      if (ownsLoading()) {
        if (append) currentState.setDiscoveryLoadingMore(channelId, false);
        else currentState.setDiscoveryLoading(channelId, false);
      }
    }
  }, [captureSession, isCurrentSession, scrollContainerRef, t, toast]);

  const handleAnalyzePage = useCallback(async () => {
    const analysisState = latestStateRef.current;
    const channel = analysisState.selectedDiscoveryChannel;
    const pageRepos = analysisState.discoveryRepos[channel] || [];
    const unanalyzed = pageRepos.filter(repo => !repo.analyzed_at || repo.analysis_failed);
    const session = captureSession();

    analysisTargetRef.current = { channel, platform: analysisState.discoveryPlatform };
    analysisSessionRef.current = session;
    try {
      await runAnalysis({ repositories: unanalyzed, scope: 'all', syncOnComplete: false });
    } finally {
      if (analysisSessionRef.current === session) {
        analysisSessionRef.current = null;
        analysisTargetRef.current = null;
      }
    }
  }, [captureSession, runAnalysis]);

  const handleAbortAnalysis = useCallback(() => {
    void requestAnalysisStop();
  }, [requestAnalysisStop]);

  return {
    ...state,
    t,
    isAnalyzing: isAnalysisRunning,
    refreshChannel,
    handleAnalyzePage,
    handleAbortAnalysis,
  };
};
