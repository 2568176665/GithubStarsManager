import { useAppStore } from '../store/useAppStore';

type AppStoreState = ReturnType<typeof useAppStore.getState>;

/**
 * Fields stored in the backend settings snapshot. The GitHub token remains
 * client-side; the IndexedDB copy is only a cache. The backend API secret is
 * a connection credential and remains in the browser session.
 */
export const APP_STATE_SNAPSHOT_KEYS = [
  'user',
  'gists',
  'starredGists',
  'gistSearchFilters',
  'selectedGistCategory',
  'forks',
  'readForks',
  'releaseSubscriptions',
  'readReleases',
  'releaseViewMode',
  'releaseShowMode',
  'releaseLatestMode',
  'releaseSelectedFilters',
  'releaseSearchQuery',
  'releaseExpandedRepositories',
  'forkViewMode',
  'forkSelectedFilters',
  'forkSearchQuery',
  'forkExpandedRepositories',
  'discoveryRepos',
  'discoveryChannels',
  'discoveryLastRefresh',
  'discoveryTotalCount',
  'discoveryHasMore',
  'discoveryNextPage',
  'discoveryScrollPositions',
  'selectedDiscoveryChannel',
  'discoveryPlatform',
  'discoveryLanguage',
  'discoverySortBy',
  'discoverySortOrder',
  'discoverySearchQuery',
  'discoverySelectedTopic',
  'trendingTimeRange',
  'subscriptionRepos',
  'subscriptionLastRefresh',
  'subscriptionChannels',
  'headerMenuConfig',
  'syncMode',
  'syncModeConfigured',
  'categoryListIdMap',
  'activeAIConfig',
  'activeWebDAVConfig',
  'activeEmbeddingConfig',
  'customCategories',
  'hiddenDefaultCategoryIds',
  'defaultCategoryOverrides',
  'categoryOrder',
  'collapsedSidebarCategoryCount',
  'categoryMatchMode',
  'assetFilters',
  'releaseSourceSettings',
  'includePreRelease',
  'includeKeysInBackup',
  'theme',
  'themePreset',
  'currentView',
  'selectedCategory',
  'language',
  'translationEngine',
  'isSidebarCollapsed',
  'lastSync',
  'lastBackup',
  'repositoryViewMode',
  'searchFilters',
  'vectorSearchStatus',
  'proxyConfig',
  'rpcDownloadConfig',
  'mcpConfig',
] as const;

export function hasAppStateSnapshotChanged(state: AppStoreState, previousState: AppStoreState): boolean {
  const current = state as unknown as Record<string, unknown>;
  const previous = previousState as unknown as Record<string, unknown>;
  return APP_STATE_SNAPSHOT_KEYS.some((key) => current[key] !== previous[key]);
}

/**
 * Data that should follow the account across browser origins. The GitHub token
 * and backend API secret are deliberately excluded from this snapshot.
 */
export function buildAppStateSnapshot(state: AppStoreState): Record<string, unknown> {
  return {
    user: state.user,
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
    themePreset: state.themePreset,
    translationEngine: state.translationEngine,
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
      password: state.proxyConfig.password,
    },
    rpcDownloadConfig: {
      enabled: state.rpcDownloadConfig.enabled,
      host: state.rpcDownloadConfig.host,
      port: state.rpcDownloadConfig.port,
      secret: state.rpcDownloadConfig.secret,
    },
    mcpConfig: {
      enabled: state.mcpConfig.enabled,
      host: state.mcpConfig.host,
      port: state.mcpConfig.port,
      token: state.mcpConfig.token,
    },
    vectorSearchStatus: state.vectorSearchStatus,
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
    'themePreset', 'translationEngine', 'vectorSearchStatus',
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
    if (Object.prototype.hasOwnProperty.call(snapshot, field) && snapshot[field] !== undefined) next[field] = snapshot[field];
  }

  if (Object.prototype.hasOwnProperty.call(snapshot, 'user') && (snapshot.user === null || useAppStore.getState().githubToken)) {
    next.user = snapshot.user;
    next.isAuthenticated = !!snapshot.user && !!useAppStore.getState().githubToken;
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
