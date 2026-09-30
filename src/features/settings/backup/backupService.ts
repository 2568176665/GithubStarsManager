import { version as appVersion } from '../../../../package.json';
import { discoveryAnalysisStorage, type DiscoveryAnalysisRecord } from '../../../services/discoveryAnalysisStorage';
import { repositoryChatSessionRepository, type RepositoryChatSnapshot } from '../../repository-chat/repositories/sessionRepository';
import { appPersistenceOptions } from '../../../store/persistence/options';
import { normalizePersistedState } from '../../../store/normalizers/persistedState';
import { useAppStore } from '../../../store/useAppStore';
import type { AppStoreState } from '../../../store/types';
import type { PersistedAppState } from '../../../store/schema';
import { normalizeAssetFilters } from '../../../utils/assetFilters';
import { mergeReleaseSourceSettings, normalizeReleaseSourceSettings } from '../../../utils/releaseSources';

const MASKED_SECRET = '***';
const SEARCH_HISTORY_KEY = 'github-stars-search-history';
const LAST_SEARCH_TIME_KEY = 'lastSearchTime';
const AUTH_KEYS = new Set(['user', 'githubToken', 'isAuthenticated', 'analyzingGistIds']);
const ARRAY_SET_KEYS = ['releaseSubscriptions', 'readReleases', 'readForks', 'releaseExpandedRepositories', 'forkExpandedRepositories'] as const;
const MERGE_BY_ID_KEYS = new Set([
  'repositories', 'releases', 'gists', 'starredGists', 'forks', 'customCategories',
  'assetFilters', 'discoveryChannels', 'subscriptionChannels', 'aiConfigs', 'webdavConfigs', 'embeddingConfigs',
]);

export type BackupData = Omit<PersistedAppState, 'user' | 'githubToken' | 'isAuthenticated' | 'analyzingGistIds'> & {
  repositoryChat?: RepositoryChatSnapshot;
  discoveryAnalyses?: DiscoveryAnalysisRecord;
  searchHistory?: string[];
  lastSearchTime?: string | null;
};

export interface BackupDocument {
  version: '1.0' | '1.2' | '2.0';
  exportDate: string;
  appVersion: string;
  data: BackupData;
}

const readSearchHistory = (): string[] => {
  if (typeof window === 'undefined') throw new Error('Browser storage is unavailable');
  const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error('Invalid local search history');
  }
  return parsed;
};

const mapSecrets = (data: Record<string, unknown>, includeKeys: boolean): Record<string, unknown> => {
  const result = { ...data };
  const mapConfigSecrets = (key: string, secret: string) => {
    const configs = result[key];
    if (!Array.isArray(configs)) return;
    result[key] = configs.map((value) => {
      if (!value || typeof value !== 'object') return value;
      const config = value as Record<string, unknown>;
      const original = config[secret];
      return {
        ...config,
        [secret]: includeKeys ? original : (typeof original === 'string' && original ? MASKED_SECRET : ''),
      };
    });
  };
  mapConfigSecrets('aiConfigs', 'apiKey');
  mapConfigSecrets('embeddingConfigs', 'apiKey');
  mapConfigSecrets('webdavConfigs', 'password');
  if (result.rpcDownloadConfig && typeof result.rpcDownloadConfig === 'object') {
    const config = result.rpcDownloadConfig as Record<string, unknown>;
    result.rpcDownloadConfig = {
      ...config,
      secret: includeKeys ? config.secret : (typeof config.secret === 'string' && config.secret ? MASKED_SECRET : ''),
    };
  }
  if (result.vectorSearchConfig && typeof result.vectorSearchConfig === 'object') {
    const config = result.vectorSearchConfig as Record<string, unknown>;
    result.vectorSearchConfig = {
      ...config,
      authToken: includeKeys ? config.authToken : (typeof config.authToken === 'string' && config.authToken ? MASKED_SECRET : ''),
    };
  }
  return result;
};

export async function createBackupDocument(): Promise<BackupDocument> {
  const state = useAppStore.getState();
  const partialize = appPersistenceOptions.partialize;
  if (!partialize) throw new Error('App persistence snapshot is unavailable');
  const persisted = partialize(state) as Record<string, unknown>;
  for (const key of AUTH_KEYS) delete persisted[key];

  const [repositoryChat, discoveryAnalyses] = await Promise.all([
    repositoryChatSessionRepository.exportSnapshot(),
    discoveryAnalysisStorage.exportAllAnalyses(),
  ]);
  const data = mapSecrets({
    ...persisted,
    // Subscription channel definitions are synced settings but omitted by the local persistence partialize.
    subscriptionChannels: state.subscriptionChannels,
    repositoryChat,
    discoveryAnalyses,
    searchHistory: readSearchHistory(),
    lastSearchTime: window.localStorage.getItem(LAST_SEARCH_TIME_KEY),
  }, state.includeKeysInBackup) as BackupData;

  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appVersion,
    data,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

export function parseBackupDocument(value: unknown): BackupDocument {
  if (!isRecord(value) || typeof value.version !== 'string') throw new Error('Invalid backup file format');
  const version = value.version;
  if (version !== '1.0' && version !== '1.2' && version !== '2.0') {
    throw new Error(`Unsupported backup version: ${version}`);
  }

  let rawData: unknown = value.data;
  if (version === '1.2' && rawData === undefined) {
    rawData = Object.fromEntries(Object.entries(value).filter(([key]) => !['version', 'exportedAt', 'exportDate', 'appVersion'].includes(key)));
  }
  if (!isRecord(rawData)) throw new Error('Invalid backup data');

  if (version === '2.0') {
    if (typeof value.exportDate !== 'string' || typeof value.appVersion !== 'string') {
      throw new Error('Invalid backup metadata');
    }
    validateRepositoryChatSnapshot(rawData.repositoryChat);
    validateDiscoveryAnalyses(rawData.discoveryAnalyses);
    if (!Array.isArray(rawData.searchHistory) || rawData.searchHistory.some((entry) => typeof entry !== 'string')) {
      throw new Error('Invalid backup search history');
    }
    if (rawData.lastSearchTime !== null && typeof rawData.lastSearchTime !== 'string') {
      throw new Error('Invalid backup search time');
    }
  }

  return {
    version,
    exportDate: typeof value.exportDate === 'string'
      ? value.exportDate
      : typeof value.exportedAt === 'string' ? value.exportedAt : '',
    appVersion: typeof value.appVersion === 'string' ? value.appVersion : appVersion,
    data: rawData as BackupData,
  };
}

function validateRepositoryChatSnapshot(value: unknown): asserts value is RepositoryChatSnapshot {
  if (!isRecord(value)) throw new Error('Invalid repository chat snapshot');
  const sessions = value.sessions;
  const messages = value.messages;
  const toolEvents = value.toolEvents;
  const evidence = value.evidence;
  const isString = (item: unknown, key: string) => isRecord(item) && typeof item[key] === 'string';
  if (!Array.isArray(sessions) || sessions.some((session) => (
    !isString(session, 'id') || !isString(session, 'repoFullName') || !isString(session, 'sourceRefSha')
    || !isString(session, 'title') || !isString(session, 'createdAt') || !isString(session, 'updatedAt')
    || typeof session.repoId !== 'number'
  ))) throw new Error('Invalid repository chat snapshot store: sessions');
  if (!Array.isArray(messages) || messages.some((message) => (
    !isString(message, 'id') || !isString(message, 'sessionId') || !isString(message, 'content')
    || !isString(message, 'createdAt') || !['user', 'assistant', 'system'].includes(String((message as Record<string, unknown>).role))
    || !['complete', 'streaming', 'error', 'aborted'].includes(String((message as Record<string, unknown>).status))
    || !Array.isArray((message as Record<string, unknown>).evidenceIds)
    || ((message as Record<string, unknown>).evidenceIds as unknown[]).some((id) => typeof id !== 'string')
  ))) throw new Error('Invalid repository chat snapshot store: messages');
  if (!Array.isArray(toolEvents) || toolEvents.some((event) => (
    !isString(event, 'id') || !isString(event, 'sessionId') || !isString(event, 'messageId')
    || !isString(event, 'toolName') || !isString(event, 'paramSummary') || !isString(event, 'createdAt')
    || !['pending', 'running', 'success', 'error'].includes(String((event as Record<string, unknown>).status))
  ))) throw new Error('Invalid repository chat snapshot store: toolEvents');
  if (!Array.isArray(evidence) || evidence.some((item) => (
    !isString(item, 'id') || !isString(item, 'repoFullName') || !isString(item, 'url')
    || !isString(item, 'excerpt') || !isString(item, 'retrievedAt')
    || !['github', 'existing-vector', 'web'].includes(String((item as Record<string, unknown>).source))
  ))) throw new Error('Invalid repository chat snapshot store: evidence');
}

function validateDiscoveryAnalyses(value: unknown): asserts value is DiscoveryAnalysisRecord {
  if (!isRecord(value) || Object.entries(value).some(([id, analysis]) => (
    !/^(0|[1-9]\d*)$/.test(id) || !Number.isSafeInteger(Number(id)) || !isRecord(analysis)
  ))) throw new Error('Invalid discovery analyses snapshot');
}

const preserveSecret = (incoming: unknown, current: unknown, includeKeys: boolean): string => {
  if (includeKeys && typeof incoming === 'string' && incoming !== MASKED_SECRET) return incoming;
  return typeof current === 'string' && current !== MASKED_SECRET ? current : '';
};

const restoreConfigSecrets = (data: Record<string, unknown>, current: AppStoreState, includeKeys: boolean) => {
  const result = { ...data };
  const mapConfigs = (key: 'aiConfigs' | 'embeddingConfigs' | 'webdavConfigs', secret: 'apiKey' | 'password') => {
    const incoming = result[key];
    if (!Array.isArray(incoming)) return;
    const currentConfigs = current[key] as unknown as Array<Record<string, unknown>>;
    const currentById = new Map(currentConfigs.map((config) => [config.id, config]));
    result[key] = incoming.map((value) => {
      if (!isRecord(value)) return value;
      return { ...value, [secret]: preserveSecret(value[secret], currentById.get(value.id as string)?.[secret], includeKeys) };
    });
  };
  mapConfigs('aiConfigs', 'apiKey');
  mapConfigs('embeddingConfigs', 'apiKey');
  mapConfigs('webdavConfigs', 'password');
  if (isRecord(result.rpcDownloadConfig)) {
    result.rpcDownloadConfig = {
      ...result.rpcDownloadConfig,
      secret: preserveSecret(result.rpcDownloadConfig.secret, current.rpcDownloadConfig.secret, includeKeys),
    };
  }
  if (isRecord(result.vectorSearchConfig)) {
    result.vectorSearchConfig = {
      ...result.vectorSearchConfig,
      authToken: preserveSecret(result.vectorSearchConfig.authToken, current.vectorSearchConfig.authToken, includeKeys),
    };
  }
  return result;
};

const mergeById = (current: unknown[], incoming: unknown[]): unknown[] => {
  const values = new Map<string | number, unknown>();
  for (const value of [...current, ...incoming]) {
    if (isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number')) values.set(value.id, value);
  }
  return [...values.values()];
};

const prepareAppState = (
  backupData: Record<string, unknown>,
  mode: 'merge' | 'replace',
  current: AppStoreState,
): Partial<AppStoreState> => {
  const includeKeys = backupData.includeKeysInBackup !== false;
  const restoredData = restoreConfigSecrets(backupData, current, includeKeys);
  const currentRecord = current as unknown as Record<string, unknown>;
  const stateFields = Object.fromEntries(Object.entries(restoredData).filter(([key]) => (
    key in currentRecord && !AUTH_KEYS.has(key) && key !== 'repositoryChat' && key !== 'discoveryAnalyses' && key !== 'searchHistory' && key !== 'lastSearchTime'
  ))) as PersistedAppState;

  if (mode === 'merge') {
    for (const key of MERGE_BY_ID_KEYS) {
      const incoming = stateFields[key as keyof PersistedAppState];
      const existing = currentRecord[key];
      if (Array.isArray(incoming) && Array.isArray(existing)) {
        (stateFields as Record<string, unknown>)[key] = mergeById(existing, incoming);
      }
    }
    for (const key of ARRAY_SET_KEYS) {
      const incoming = stateFields[key];
      const existing = currentRecord[key];
      if (Array.isArray(incoming) && existing instanceof Set) {
        (stateFields as Record<string, unknown>)[key] = [...new Set([...existing, ...incoming])];
      }
    }
    for (const key of ['hiddenDefaultCategoryIds', 'categoryOrder'] as const) {
      const incoming = stateFields[key];
      const existing = currentRecord[key];
      if (Array.isArray(incoming) && Array.isArray(existing)) {
        (stateFields as Record<string, unknown>)[key] = [...new Set([...existing, ...incoming])];
      }
    }
    for (const key of ['defaultCategoryOverrides', 'categoryListIdMap'] as const) {
      const incoming = stateFields[key];
      const existing = currentRecord[key];
      if (isRecord(incoming) && isRecord(existing)) stateFields[key] = { ...existing, ...incoming } as never;
    }
    // These objects are intentionally only partly persisted; keep their runtime-only filters.
    if (isRecord(stateFields.searchFilters)) {
      stateFields.searchFilters = { ...current.searchFilters, ...stateFields.searchFilters } as never;
    }
    if (isRecord(stateFields.gistSearchFilters)) {
      stateFields.gistSearchFilters = { ...current.gistSearchFilters, ...stateFields.gistSearchFilters } as never;
    }
    if (isRecord(stateFields.releaseSourceSettings)) {
      stateFields.releaseSourceSettings = mergeReleaseSourceSettings(
        current.releaseSourceSettings,
        normalizeReleaseSourceSettings(stateFields.releaseSourceSettings),
      );
    }
  }

  const normalized = normalizePersistedState(stateFields, current);
  const next = Object.fromEntries(Object.keys(stateFields).map((key) => [key, (normalized as unknown as Record<string, unknown>)[key]])) as Partial<AppStoreState>;
  if ('repositories' in stateFields) next.searchResults = normalized.repositories;
  if ('gists' in stateFields) next.gistSearchResults = normalized.gistSearchResults;
  if ('assetFilters' in stateFields) next.assetFilters = normalizeAssetFilters(stateFields.assetFilters);
  return next;
};

export async function restoreBackupDocument(document: BackupDocument, mode: 'merge' | 'replace'): Promise<void> {
  if (!isRecord(document.data)) throw new Error('Invalid backup data');
  const backupData = document.data;
  if (document.version === '2.0') {
    validateRepositoryChatSnapshot(backupData.repositoryChat);
    validateDiscoveryAnalyses(backupData.discoveryAnalyses);
    if (!Array.isArray(backupData.searchHistory) || backupData.searchHistory.some((entry) => typeof entry !== 'string')) {
      throw new Error('Invalid backup search history');
    }
    if (backupData.lastSearchTime !== null && typeof backupData.lastSearchTime !== 'string') {
      throw new Error('Invalid backup search time');
    }
  }

  const current = useAppStore.getState();
  const next = prepareAppState(backupData, mode, current);
  const restoredSearchHistory = Array.isArray(backupData.searchHistory)
    ? mode === 'merge'
      ? [...new Set([...backupData.searchHistory, ...readSearchHistory()])]
      : backupData.searchHistory
    : null;
  const isFullBackup = document.version === '2.0';
  const previousHistory = window.localStorage.getItem(SEARCH_HISTORY_KEY);
  const previousSearchTime = window.localStorage.getItem(LAST_SEARCH_TIME_KEY);
  const [previousChat, previousAnalyses] = isFullBackup
    ? await Promise.all([
      repositoryChatSessionRepository.exportSnapshot(),
      discoveryAnalysisStorage.exportAllAnalyses(),
    ])
    : [null, null];
  let analysesApplied = false;
  let chatApplied = false;
  let historyChanged = false;
  let searchTimeChanged = false;
  let appStateChanged = false;

  try {
    // Write the analysis database first so a failure cannot leave chat data replaced.
    if (isFullBackup) {
      await discoveryAnalysisStorage.restoreAllAnalyses(backupData.discoveryAnalyses as DiscoveryAnalysisRecord, mode);
      analysesApplied = true;
      await repositoryChatSessionRepository.restoreSnapshot(backupData.repositoryChat as RepositoryChatSnapshot, mode);
      chatApplied = true;
    }
    if (restoredSearchHistory) {
      historyChanged = true;
      window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(restoredSearchHistory));
    }
    if (typeof backupData.lastSearchTime === 'string' || backupData.lastSearchTime === null) {
      searchTimeChanged = true;
      if (backupData.lastSearchTime === null) window.localStorage.removeItem(LAST_SEARCH_TIME_KEY);
      else window.localStorage.setItem(LAST_SEARCH_TIME_KEY, backupData.lastSearchTime);
    }
    appStateChanged = true;
    useAppStore.setState(next);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    const rollback = async (operation: () => Promise<void>) => {
      try { await operation(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    };
    if (chatApplied && previousChat) {
      await rollback(() => repositoryChatSessionRepository.restoreSnapshot(previousChat, 'replace'));
    }
    if (analysesApplied && previousAnalyses) {
      await rollback(() => discoveryAnalysisStorage.restoreAllAnalyses(previousAnalyses, 'replace'));
    }
    try {
      if (historyChanged) {
        if (previousHistory === null) window.localStorage.removeItem(SEARCH_HISTORY_KEY);
        else window.localStorage.setItem(SEARCH_HISTORY_KEY, previousHistory);
      }
      if (searchTimeChanged) {
        if (previousSearchTime === null) window.localStorage.removeItem(LAST_SEARCH_TIME_KEY);
        else window.localStorage.setItem(LAST_SEARCH_TIME_KEY, previousSearchTime);
      }
      if (appStateChanged) useAppStore.setState(current);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    if (rollbackErrors.length) {
      console.error('Backup restore rollback failed:', rollbackErrors);
      throw new Error(`${(error as Error).message}; rollback was incomplete`);
    }
    throw error;
  }
}
