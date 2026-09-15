import { useCallback, useMemo, useState, type MutableRefObject, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Category, Repository } from '../../../types';
import { useAppStore, getAllCategories } from '../../../store/useAppStore';
import { AIService, isAbortError } from '../../../services/aiService';
import { EmbeddingClient, VectorSearchService } from '../../../services/vectorSearchService';
import { GitHubApiService } from '../../../services/githubApi';
import { createGitHubListsApiService } from '../../../services/githubApiFactory';
import { forceSyncToBackend } from '../../../services/autoSync';
import { useDialog } from '../../../hooks/useDialog';
import type { GitHubList } from '../../../services/githubListsApi';
import type { VectorQueryResult } from '../../../services/vectorSearchService';
import { backend } from '../../../services/backendAdapter';
import { isReservedCategoryName } from '../../../utils/categoryUtils';
import {
  classifyLocalSearchQuality,
  mergeHybridSearchResults,
  performWeightedTextSearch,
} from '../../../utils/repoSearch';

// ===== 提纯纯函数（来源逐字对应 SearchBar 基线行号） =====

// SearchBar 446-459：轻量关键词加分 + scoreMap 构造。
export const buildSearchPatch = (
  query: string,
  vectorResults: VectorQueryResult[],
): Map<string, number> => {
  const queryLower = query.toLowerCase();
  const boostedResults = vectorResults.map(r => {
    let bonus = 0;
    const name = (r.metadata?.full_name || '').toLowerCase();
    const desc = (r.metadata?.description || '').toLowerCase();
    const tags = (r.metadata?.tags || []).map(tag => tag.toLowerCase());
    if (name.includes(queryLower)) bonus += 0.05;
    if (desc.includes(queryLower)) bonus += 0.03;
    if (tags.some(tag => tag.includes(queryLower))) bonus += 0.02;
    return { ...r, score: r.score + bonus };
  });
  return new Map(boostedResults.map(r => [r.id, r.score]));
};

// SearchBar 725-750：星标同步结果与本地仓库逐字段合并（license `?? null` 回填）。
export const mergeStarredRepositories = (
  newRepos: Repository[],
  storeRepos: Repository[],
): Repository[] => {
  const existingRepoMap = new Map(storeRepos.map(repo => [repo.id, repo]));
  return newRepos.map(newRepo => {
    const existing = existingRepoMap.get(newRepo.id);
    if (existing) {
      return {
        ...existing,
        name: newRepo.name,
        full_name: newRepo.full_name,
        description: newRepo.description,
        html_url: newRepo.html_url,
        stargazers_count: newRepo.stargazers_count,
        forks_count: newRepo.forks_count,
        forks: newRepo.forks,
        language: newRepo.language,
        updated_at: newRepo.updated_at,
        pushed_at: newRepo.pushed_at,
        starred_at: newRepo.starred_at,
        owner: newRepo.owner,
        topics: newRepo.topics,
        // 回填历史仓库缺失的 license 字段（GitHub 源元数据，跟随 newRepo）
        license: newRepo.license ?? null,
      };
    }
    return newRepo;
  });
};

// SearchBar 774-799：构造"list 名(小写) → 本地分类"映射并为云端 list 规划缺失的自定义分类。
// makeCategoryId 由 hook 注入（原实现内联 `custom-sync-${Date.now()}-${idx}`），保持可测性。
export const planListCategories = (
  lists: GitHubList[],
  localCategories: Category[],
  makeCategoryId: (idx: number) => string,
): { toCreate: Category[]; categoryByLowerName: Map<string, string> } => {
  // 值使用本地分类的原始名称（保留其大小写），而非 list 名：
  // 锁定分类的筛选用精确相等比较，若直接存 GitHub 侧的大小写，
  // 仓库会从分类结果中消失（如 list 名为 "web apps" 而分类为 "Web Apps"）。
  const categoryByLowerName = new Map(
    localCategories
      .filter(c => c.id !== 'all' && !isReservedCategoryName(c.name))
      .map(c => [c.name.toLowerCase(), c.name])
  );
  const toCreate: Category[] = [];
  lists.forEach((list, idx) => {
    const lower = list.name.toLowerCase();
    if (isReservedCategoryName(list.name) || categoryByLowerName.has(lower)) return;
    toCreate.push({
      id: makeCategoryId(idx),
      name: list.name,
      icon: ' 📋',
      isCustom: true,
      keywords: [],
    });
    // 纳入本次运行使用的映射，使后续 listMatchesCategory 命中、可设分类并加锁
    categoryByLowerName.set(lower, list.name);
  });
  return { toCreate, categoryByLowerName };
};

// SearchBar 807-868：preExistingLocked 集 + 打标签/设分类/加锁循环 + last_edited。
export const applyListsToRepositories = (
  repositories: Repository[],
  lists: GitHubList[],
  categoryByLowerName: Map<string, string>,
): { repositories: Repository[]; appliedTagsCount: Record<string, number> } => {
  const listRepoMap = new Map(repositories.map(repo => [repo.full_name.toLowerCase(), repo]));
  const appliedTagsCount: Record<string, number> = {};

  // DEC-4：只判定锁定状态。
  // 区分"本次同步开始前已存在"的锁定与"本次运行中新产生"的锁定：
  // - 预存在的锁定：不覆盖其分类与锁定，但仍追加本次命中的 list 名为
  //   custom_tags（修复 #273：否则一旦仓库被锁过，之后云端 list 的任何
  //   变化都被跳过，导致"无法将云端 list 拉取到本地"）。
  // - 本次运行中被前面的 list 刚锁定：保留已分配的分类/锁定，继续追加后续 list 的标签
  const preExistingLocked = new Set(
    repositories
      .filter(r => r.category_locked)
      .map(r => r.full_name.toLowerCase())
  );

  for (const list of lists) {
    let appliedCount = 0;
    for (const fullName of list.items) {
      const key = fullName.toLowerCase();
      const repo = listRepoMap.get(key);
      if (!repo) continue;

      const customTags = repo.custom_tags ? [...repo.custom_tags] : [];
      if (!customTags.includes(list.name)) {
        customTags.push(list.name);
      }

      // 预存在锁定：不覆盖其分类与锁定，仅追加 list 名为标签，让云端
      // list 关系仍能反映到本地（修复 #273）。
      if (preExistingLocked.has(key)) {
        // 仅当标签确有变化才写回，避免无谓的 last_edited 抖动
        if (customTags.length !== (repo.custom_tags?.length ?? 0)) {
          listRepoMap.set(key, { ...repo, custom_tags: customTags });
        }
        appliedCount++;
        continue;
      }

      // 本次运行中刚被锁定的仓库：保留已分配的分类与锁定，仅追加标签
      if (repo.category_locked) {
        listRepoMap.set(key, { ...repo, custom_tags: customTags });
        appliedCount++;
        continue;
      }

      // 若 list 名对应某个本地分类：设置分类并加锁；否则仅加标签（多分类靠标签匹配）
      const listMatchesCategory = categoryByLowerName.has(list.name.toLowerCase());
      const updatedRepo: Repository = listMatchesCategory
        ? {
            ...repo,
            custom_tags: customTags,
            custom_category: categoryByLowerName.get(list.name.toLowerCase()),
            category_locked: true,
            last_edited: new Date().toISOString(),
          }
        : {
            ...repo,
            custom_tags: customTags,
          };

      listRepoMap.set(key, updatedRepo);
      appliedCount++;
    }
    if (appliedCount > 0) {
      appliedTagsCount[list.name] = appliedCount;
    }
  }

  return {
    repositories: repositories.map(repo =>
      listRepoMap.get(repo.full_name.toLowerCase()) || repo
    ),
    appliedTagsCount,
  };
};

// ===== Hook =====

export interface SearchActions {
  isSearching: boolean;
  searchPhase: string | null;
  // 渲染相关 ref：View 的过滤 effect 仍要读写，故以 RefObject 暴露。
  // 实体挂 hook、以 RefObject 暴露给 View 原样读写——写点在 aiSearch（本 hook），
  // 读点在 View 的过滤 effect（依赖 View 本地 applyFilters 闭包），整体搬入 hook
  // 会扩大改动面、引入漂移风险，"只搬运不改语义"约束下这是风险最低的切法。
  vectorScoreMapRef: MutableRefObject<{ query: string; scores: Map<string, number> } | null>;
  skipNextTextSearchRef: MutableRefObject<boolean>;
  aiSearch: (query: string, applyFilters: (repos: Repository[]) => Repository[]) => Promise<void>;
  keywordSearch: (
    query: string,
    applyFilters: (repos: Repository[]) => Repository[],
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
  syncStars: (mode?: 'auto' | 'stars-only' | 'stars-and-lists') => Promise<void>;
}

export const useSearchActions = (): SearchActions => {
  const {
    repositories,
    aiConfigs,
    activeAIConfig,
    language,
    setSearchFilters,
    setSearchResults,
    githubToken,
    setRepositories,
    setLastSync,
    setSyncingStars,
    syncMode,
    user,
    addCustomCategory,
    customCategories,
    hiddenDefaultCategoryIds,
    defaultCategoryOverrides,
  } = useAppStore(useShallow((state) => ({
    repositories: state.repositories,
    aiConfigs: state.aiConfigs,
    activeAIConfig: state.activeAIConfig,
    language: state.language,
    setSearchFilters: state.setSearchFilters,
    setSearchResults: state.setSearchResults,
    githubToken: state.githubToken,
    setRepositories: state.setRepositories,
    setLastSync: state.setLastSync,
    setSyncingStars: state.setSyncingStars,
    syncMode: state.syncMode,
    user: state.user,
    addCustomCategory: state.addCustomCategory,
    customCategories: state.customCategories,
    hiddenDefaultCategoryIds: state.hiddenDefaultCategoryIds,
    defaultCategoryOverrides: state.defaultCategoryOverrides,
  })));

  const { toast } = useDialog();
  const [isSearching, setIsSearching] = useState(false);
  const [searchPhase, setSearchPhase] = useState<string | null>(null);
  const vectorScoreMapRef = useRef<{ query: string; scores: Map<string, number> } | null>(null);
  const skipNextTextSearchRef = useRef(false);
  // 当前在途 AI 搜索的控制器：新搜索启动时中止旧请求（超代语义）
  const aiSearchAbortRef = useRef<AbortController | null>(null);
  const t = useCallback((zh: string, en: string) => language === 'zh' ? zh : en, [language]);

  type LexicalSearchResult = {
    repositories: Repository[];
    quality: 'identity' | 'strong-field' | 'weak-text' | 'no-results';
  };

  const executeLexicalSearch = useCallback(async (
    query: string,
    signal?: AbortSignal,
  ): Promise<LexicalSearchResult> => {
    if (backend.isAvailable) {
      try {
        const response = await backend.searchRepositoryIndex({
          query,
          filters: useAppStore.getState().searchFilters,
          limit: 50,
        }, signal);
        const order = new Map(response.items.map((item, index) => [String(item.id), index]));
        const indexed = repositories.filter((repository) => order.has(String(repository.id)));
        indexed.sort((a, b) => (order.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (order.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER));
        return { repositories: indexed, quality: response.quality };
      } catch (error) {
        if (isAbortError(error)) throw error;
        console.warn('D1 search failed, falling back to local weighted search:', error);
      }
    }

    const localResults = performWeightedTextSearch(repositories, query);
    return { repositories: localResults, quality: classifyLocalSearchQuality(localResults, query) };
  }, [repositories]);

  const keywordSearch = useCallback(async (
    query: string,
    applyFilters: (repos: Repository[]) => Repository[],
    options?: { signal?: AbortSignal },
  ): Promise<void> => {
    if (!query.trim()) return;
    const controllerSignal = options?.signal;
    const throwIfAborted = () => {
      if (controllerSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
    };
    const raw = await executeLexicalSearch(query, controllerSignal);
    throwIfAborted();
    let selected = raw.repositories;

    const vsConfig = useAppStore.getState().vectorSearchConfig;
    const activeEmbeddingConfig = useAppStore.getState().embeddingConfigs.find(
      (config) => config.id === vsConfig?.embeddingConfigId,
    );
    const qualityRank = (quality: LexicalSearchResult['quality']): number => ({
      'no-results': 0,
      'weak-text': 1,
      'strong-field': 2,
      identity: 3,
    }[quality]);

    if (raw.quality === 'weak-text' || raw.quality === 'no-results') {
      // Native Vectorize is a Worker capability. If the Worker is unavailable,
      // keep the search local and do not use legacy external vector settings.
      if (vsConfig?.enabled && backend.isAvailable) {
        if (activeEmbeddingConfig) {
          try {
            setSearchPhase(t('生成查询向量…', 'Generating query vector…'));
            const embeddingClient = new EmbeddingClient(activeEmbeddingConfig);
            const vectorService = new VectorSearchService(vsConfig);
            const vectors = await embeddingClient.embed([query], 'query', controllerSignal);
            throwIfAborted();
            if (vectors[0]) {
              setSearchPhase(t('搜索向量索引…', 'Searching vector index…'));
              const vectorResults = await vectorService.query(vectors[0], {
                topK: vsConfig.searchTopK ?? 30,
                threshold: vsConfig.searchThreshold ?? 0.35,
              }, controllerSignal);
              throwIfAborted();
              if (vectorResults.length > 0) {
                selected = mergeHybridSearchResults(repositories, raw.repositories, vectorResults);
                const hybridScores = buildSearchPatch(query, vectorResults);
                selected.forEach((repository, index) => {
                  if (!hybridScores.has(String(repository.id))) {
                    hybridScores.set(String(repository.id), 1 / (100 + index));
                  }
                });
                vectorScoreMapRef.current = {
                  query,
                  scores: hybridScores,
                };
              }
            }
          } catch (error) {
            if (isAbortError(error)) throw error;
            console.warn('Vector search failed, returning FTS results:', error);
          }
        }
      } else if (activeAIConfig) {
        try {
          setSearchPhase(t('改写搜索查询…', 'Rewriting search query…'));
          const config = aiConfigs.find((item) => item.id === activeAIConfig);
          if (config) {
            const rewritten = await new AIService(config, language).rewriteSearchQuery(query, controllerSignal);
            throwIfAborted();
            if (rewritten && rewritten.trim().toLocaleLowerCase() !== query.trim().toLocaleLowerCase()) {
              const rewrittenResult = await executeLexicalSearch(rewritten, controllerSignal);
              throwIfAborted();
              if (rewrittenResult.repositories.length > 0
                && (qualityRank(rewrittenResult.quality) > qualityRank(raw.quality)
                  || (qualityRank(rewrittenResult.quality) === qualityRank(raw.quality)
                    && rewrittenResult.repositories.length > raw.repositories.length))) {
                selected = rewrittenResult.repositories;
              }
            }
          }
        } catch (error) {
          if (isAbortError(error)) throw error;
          console.warn('AI query rewrite failed, returning FTS results:', error);
        }
      }
    }

    throwIfAborted();
    const selectedOrder = new Map(selected.map((repository, index) => [String(repository.id), index]));
    const finalResults = applyFilters(selected).sort(
      (a, b) => (selectedOrder.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER)
        - (selectedOrder.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER),
    );
    skipNextTextSearchRef.current = true;
    setSearchResults(finalResults);
    setSearchFilters({ query });
  }, [activeAIConfig, aiConfigs, executeLexicalSearch, language, repositories, setSearchFilters, setSearchResults, t]);

  const aiSearch = useCallback(async (
    query: string,
    applyFilters: (repos: Repository[]) => Repository[],
  ): Promise<void> => {
    if (!query.trim()) return;
    aiSearchAbortRef.current?.abort();
    const controller = new AbortController();
    aiSearchAbortRef.current = controller;
    setIsSearching(true);
    setSearchPhase(null);
    vectorScoreMapRef.current = null;

    try {
      await keywordSearch(query, applyFilters, { signal: controller.signal });
    } catch (error) {
      if (!isAbortError(error)) console.error('Search failed:', error);
    } finally {
      if (aiSearchAbortRef.current === controller) {
        aiSearchAbortRef.current = null;
        setIsSearching(false);
        setSearchPhase(null);
      }
    }
  }, [keywordSearch]);

  const syncStars = useCallback(async (mode: 'auto' | 'stars-only' | 'stars-and-lists' = 'auto') => {
    if (!githubToken) {
      toast(t('GitHub token 未找到，请重新登录。', 'GitHub token not found. Please login again.'), 'error');
      return;
    }

    setSyncingStars(true);
    try {
      const githubApi = new GitHubApiService(githubToken);
      const newRepositories = await githubApi.getAllStarredRepositories();

      const storeRepos = useAppStore.getState().repositories;
      const mergedRepositories = mergeStarredRepositories(newRepositories, storeRepos);

      // 解析本次同步范围：
      // - 'auto'：跟随持久化配置 syncMode
      // - 'stars-only'：强制仅星标（忽略 syncMode，供下拉菜单显式选择）
      // - 'stars-and-lists'：强制星标及 list（供下拉菜单显式选择）
      const syncLists = mode === 'stars-and-lists' || (mode === 'auto' && syncMode === 'stars-and-lists');
      let finalRepositories = mergedRepositories;

      if (syncLists) {
        const appliedTagsCount: Record<string, number> = {};
        try {
          const listsApi = createGitHubListsApiService(githubToken);
          const login = user?.login;
          if (!login) {
            throw new Error(t('无法获取 GitHub 用户名，请重新登录。', 'Failed to get GitHub username. Please login again.'));
          }
          const lists = await listsApi.getUserLists(login);

          // allCategories 与 View 的 useMemo 同源同值（getAllCategories 四参口径）
          const allCategories = getAllCategories(customCategories, language, hiddenDefaultCategoryIds, defaultCategoryOverrides);
          // 为云端存在、但本地无同名分类的 list 自动创建自定义分类。
          // 修复"GitHub list 有很多新分类但本地从没拉到过"——原逻辑只贴 custom_tags
          // 标签，不建分类，导致左侧分类树永远只有历史分类。
          // 用每 list 递增的下标做 id 后缀，避免同一毫秒内多个 list 撞 id。
          const { toCreate, categoryByLowerName } = planListCategories(
            lists,
            allCategories,
            (idx) => `custom-sync-${Date.now()}-${idx}`,
          );
          toCreate.forEach((category) => addCustomCategory(category));
          const createdCategoriesCount = toCreate.length;

          const { repositories: listAppliedRepositories, appliedTagsCount: counts } =
            applyListsToRepositories(finalRepositories, lists, categoryByLowerName);
          finalRepositories = listAppliedRepositories;
          Object.assign(appliedTagsCount, counts);

          if (Object.keys(appliedTagsCount).length > 0) {
            const appliedTotal = Object.values(appliedTagsCount).reduce((a, b) => a + b, 0);
            const listSummary = Object.entries(appliedTagsCount)
              .map(([name, count]) => `${name}(${count})`)
              .join('、');
            const createdHint = createdCategoriesCount > 0
              ? t(
                  `（新建 ${createdCategoriesCount} 个分类）`,
                  ` (${createdCategoriesCount} new categor${createdCategoriesCount > 1 ? 'ies' : 'y'} created)`
                )
              : '';
            toast(t(
              `已同步 ${lists.length} 个 list，并应用到 ${appliedTotal} 个未锁定仓库：${listSummary}${createdHint}`,
              `Synced ${lists.length} lists, applied to ${appliedTotal} unlocked repositories: ${listSummary}${createdHint}`
            ), 'info');
          } else if (createdCategoriesCount > 0) {
            // 命中数为 0，但本次新建了分类（云端 list 与本地无交集但仍有其名分类）
            toast(t(
              `已同步 ${lists.length} 个 list（新建 ${createdCategoriesCount} 个分类）。`,
              `Synced ${lists.length} lists (${createdCategoriesCount} new categor${createdCategoriesCount > 1 ? 'ies' : 'y'} created).`
            ), 'info');
          }
        } catch (listError) {
          console.error('List sync failed:', listError);
          toast(t(
            'List 同步失败，星标仓库已同步。请稍后重试，或检查 GitHub Token 权限（需 user scope）。',
            'List sync failed, starred repositories were synced. Retry later, or check the GitHub Token has the user scope.'
          ), 'error');
          // 不中断：星标同步结果仍然生效
        }
      }

      const existingRepoIds = new Set(storeRepos.map(repo => repo.id));
      const newRepoCount = newRepositories.filter(repo => !existingRepoIds.has(repo.id)).length;

      setRepositories(finalRepositories);
      await forceSyncToBackend();

      setLastSync(new Date().toISOString());

      if (newRepoCount > 0) {
        toast(t(`同步完成！发现 ${newRepoCount} 个新仓库。`, `Sync completed! Found ${newRepoCount} new repositories.`), 'success');
      } else {
        toast(t('同步完成！所有仓库都是最新的。', 'Sync completed! All repositories are up to date.'), 'info');
      }

    } catch (error) {
      console.error('Sync failed:', error);
      if (error instanceof Error && error.message.includes('token')) {
        toast(t('GitHub token 已过期或无效，请重新登录。', 'GitHub token has expired or is invalid. Please login again.'), 'error');
      } else {
        toast(t('同步失败，请检查网络连接或稍后重试。', 'Sync failed. Please check your network connection or try again later.'), 'error');
      }
    } finally {
      setSyncingStars(false);
    }
  }, [githubToken, setSyncingStars, syncMode, user, t, toast, addCustomCategory, customCategories, language, hiddenDefaultCategoryIds, defaultCategoryOverrides, setRepositories, setLastSync]);

  return useMemo(() => ({
    isSearching,
    searchPhase,
    vectorScoreMapRef,
    skipNextTextSearchRef,
    aiSearch,
    keywordSearch,
    syncStars,
  }), [isSearching, searchPhase, aiSearch, keywordSearch, syncStars]);
};
