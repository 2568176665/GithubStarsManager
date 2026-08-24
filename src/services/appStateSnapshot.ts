import { useAppStore } from '../store/useAppStore';

type AppStoreState = ReturnType<typeof useAppStore.getState>;

/**
 * Data that should follow the account across browser origins. Secrets are
 * deliberately excluded; Worker ENV and browser session storage remain the
 * source of truth for credentials.
 */
export function buildAppStateSnapshot(state: AppStoreState): Record<string, unknown> {
  return {
    gists: state.gists,
    starredGists: state.starredGists,
    gistSearchFilters: state.gistSearchFilters,
    selectedGistCategory: state.selectedGistCategory,
    forks: state.forks,
    readForks: Array.from(state.readForks),
    releaseSubscriptions: Array.from(state.releaseSubscriptions),
    readReleases: Array.from(state.readReleases),
    releaseViewMode: state.releaseViewMode,
    releaseShowMode: state.releaseShowMode,
    releaseLatestMode: state.releaseLatestMode,
    releaseSelectedFilters: state.releaseSelectedFilters,
    releaseSearchQuery: state.releaseSearchQuery,
    releaseExpandedRepositories: Array.from(state.releaseExpandedRepositories),
    forkViewMode: state.forkViewMode,
    forkSelectedFilters: state.forkSelectedFilters,
    forkSearchQuery: state.forkSearchQuery,
    forkExpandedRepositories: Array.from(state.forkExpandedRepositories),
    discoveryRepos: state.discoveryRepos,
    discoveryChannels: state.discoveryChannels,
    discoveryLastRefresh: state.discoveryLastRefresh,
    discoveryTotalCount: state.discoveryTotalCount,
    discoveryHasMore: state.discoveryHasMore,
    discoveryNextPage: state.discoveryNextPage,
    discoveryScrollPositions: state.discoveryScrollPositions,
    selectedDiscoveryChannel: state.selectedDiscoveryChannel,
    discoveryPlatform: state.discoveryPlatform,
    discoveryLanguage: state.discoveryLanguage,
    discoverySortBy: state.discoverySortBy,
    discoverySortOrder: state.discoverySortOrder,
    discoverySearchQuery: state.discoverySearchQuery,
    discoverySelectedTopic: state.discoverySelectedTopic,
    trendingTimeRange: state.trendingTimeRange,
    subscriptionRepos: state.subscriptionRepos,
    subscriptionLastRefresh: state.subscriptionLastRefresh,
    subscriptionChannels: state.subscriptionChannels,
    headerMenuConfig: state.headerMenuConfig,
    syncMode: state.syncMode,
    syncModeConfigured: state.syncModeConfigured,
    categoryListIdMap: state.categoryListIdMap,
    activeAIConfig: state.activeAIConfig,
    activeWebDAVConfig: state.activeWebDAVConfig,
    activeEmbeddingConfig: state.activeEmbeddingConfig,
    customCategories: state.customCategories,
    hiddenDefaultCategoryIds: state.hiddenDefaultCategoryIds,
    defaultCategoryOverrides: state.defaultCategoryOverrides,
    categoryOrder: state.categoryOrder,
    collapsedSidebarCategoryCount: state.collapsedSidebarCategoryCount,
    categoryMatchMode: state.categoryMatchMode,
    assetFilters: state.assetFilters,
    releaseSourceSettings: state.releaseSourceSettings,
    includePreRelease: state.includePreRelease,
    includeKeysInBackup: state.includeKeysInBackup,
    theme: state.theme,
    currentView: state.currentView,
    selectedCategory: state.selectedCategory,
    language: state.language,
    isSidebarCollapsed: state.isSidebarCollapsed,
    lastSync: state.lastSync,
    lastBackup: state.lastBackup,
    repositoryViewMode: state.repositoryViewMode,
    searchFilters: state.searchFilters,
    proxyConfig: {
      enabled: state.proxyConfig.enabled,
      type: state.proxyConfig.type,
      host: state.proxyConfig.host,
      port: state.proxyConfig.port,
      username: state.proxyConfig.username,
    },
    rpcDownloadConfig: {
      enabled: state.rpcDownloadConfig.enabled,
      host: state.rpcDownloadConfig.host,
      port: state.rpcDownloadConfig.port,
    },
    mcpConfig: {
      enabled: state.mcpConfig.enabled,
      host: state.mcpConfig.host,
      port: state.mcpConfig.port,
    },
  };
}

export function applyAppStateSnapshot(snapshot: Record<string, unknown>): void {
  const next: Record<string, unknown> = {};
  const arrayFields = [
    'gists', 'starredGists', 'forks', 'releaseSelectedFilters', 'forkSelectedFilters',
    'subscriptionChannels', 'releaseExpandedRepositories', 'forkExpandedRepositories',
    'readForks', 'releaseSubscriptions', 'readReleases',
    'customCategories', 'hiddenDefaultCategoryIds', 'categoryOrder', 'assetFilters', 'headerMenuConfig', 'discoveryChannels',
  ] as const;
  const objectFields = [
    'gistSearchFilters', 'discoveryRepos', 'discoveryLastRefresh', 'discoveryTotalCount',
    'discoveryHasMore', 'discoveryNextPage', 'discoveryScrollPositions', 'subscriptionRepos',
    'headerMenuConfig', 'categoryListIdMap', 'defaultCategoryOverrides', 'searchFilters',
    'releaseSourceSettings',
  ] as const;
  const scalarFields = [
    'selectedGistCategory', 'releaseViewMode', 'releaseShowMode', 'releaseLatestMode',
    'releaseSearchQuery', 'forkViewMode', 'forkSearchQuery', 'selectedDiscoveryChannel',
    'discoveryPlatform', 'discoveryLanguage', 'discoverySortBy', 'discoverySortOrder',
    'discoverySearchQuery', 'discoverySelectedTopic', 'trendingTimeRange', 'syncMode',
    'syncModeConfigured', 'theme', 'currentView', 'selectedCategory', 'language',
    'isSidebarCollapsed', 'repositoryViewMode', 'proxyConfig', 'rpcDownloadConfig', 'mcpConfig',
    'activeAIConfig', 'activeWebDAVConfig', 'activeEmbeddingConfig', 'collapsedSidebarCategoryCount',
    'categoryMatchMode', 'includePreRelease', 'includeKeysInBackup', 'lastSync', 'lastBackup',
  ] as const;

  for (const field of arrayFields) {
    if (Array.isArray(snapshot[field])) next[field] = snapshot[field];
  }
  for (const field of objectFields) {
    if (snapshot[field] && typeof snapshot[field] === 'object' && !Array.isArray(snapshot[field])) {
      next[field] = snapshot[field];
    }
  }
  for (const field of scalarFields) {
    if (snapshot[field] !== undefined && snapshot[field] !== null) next[field] = snapshot[field];
  }

  if (Array.isArray(next.readForks)) next.readForks = new Set(next.readForks as number[]);
  if (Array.isArray(next.releaseSubscriptions)) next.releaseSubscriptions = new Set(next.releaseSubscriptions as number[]);
  if (Array.isArray(next.readReleases)) next.readReleases = new Set(next.readReleases as number[]);
  if (Array.isArray(next.releaseExpandedRepositories)) next.releaseExpandedRepositories = new Set(next.releaseExpandedRepositories as number[]);
  if (Array.isArray(next.forkExpandedRepositories)) next.forkExpandedRepositories = new Set(next.forkExpandedRepositories as number[]);
  if (next.mcpConfig && typeof next.mcpConfig === 'object') {
    next.mcpConfig = { ...useAppStore.getState().mcpConfig, ...(next.mcpConfig as Record<string, unknown>) };
  }

  useAppStore.setState(next as Partial<AppStoreState>);
}
