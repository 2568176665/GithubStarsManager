import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../../store/useAppStore';
import { appPersistenceOptions } from '../../../store/persistence/options';
import { version as currentVersion } from '../../../../package.json';
import { createBackupDocument, parseBackupDocument, restoreBackupDocument } from './backupService';

vi.mock('../../../store/useAppStore', async (importOriginal) => await importOriginal());

const snapshots = vi.hoisted(() => ({
  exportChat: vi.fn(),
  restoreChat: vi.fn(),
  exportAnalyses: vi.fn(),
  restoreAnalyses: vi.fn(),
}));

vi.mock('../../repository-chat/repositories/sessionRepository', () => ({
  repositoryChatSessionRepository: {
    exportSnapshot: snapshots.exportChat,
    restoreSnapshot: snapshots.restoreChat,
  },
}));
vi.mock('../../../services/discoveryAnalysisStorage', () => ({
  discoveryAnalysisStorage: {
    exportAllAnalyses: snapshots.exportAnalyses,
    restoreAllAnalyses: snapshots.restoreAnalyses,
  },
}));

const emptyChat = { sessions: [], messages: [], toolEvents: [], evidence: [] };
const emptyAnalyses = {};

describe('backupService', () => {
  const originalState = useAppStore.getState();

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    snapshots.exportChat.mockResolvedValue(emptyChat);
    snapshots.restoreChat.mockResolvedValue(undefined);
    snapshots.exportAnalyses.mockResolvedValue(emptyAnalyses);
    snapshots.restoreAnalyses.mockResolvedValue(undefined);
    useAppStore.setState(originalState, true);
  });

  afterEach(() => {
    useAppStore.setState(originalState, true);
  });

  it('backs up every persisted app field, serializes Sets, masks secrets, and omits auth and caches', async () => {
    useAppStore.setState({
      user: { login: 'user' } as never,
      githubToken: 'must-not-export',
      isAuthenticated: true,
      includeKeysInBackup: true,
      aiConfigs: [{ id: 'ai', name: 'AI', apiKey: 'ai-secret', baseUrl: '', model: '', isActive: false }],
      embeddingConfigs: [{ id: 'embedding', name: 'Embed', apiType: 'openai', baseUrl: '', apiKey: 'embedding-secret', model: '', dimensions: 3, isActive: false }],
      webdavConfigs: [{ id: 'dav', name: 'DAV', url: '', username: '', password: 'dav-secret', path: '', isActive: false }],
      rpcDownloadConfig: { enabled: false, host: '', port: 6800, secret: 'rpc-secret' },
      vectorSearchConfig: { ...useAppStore.getState().vectorSearchConfig, authToken: 'vector-secret' },
      releaseSubscriptions: new Set([12]),
      readReleases: new Set([34]),
      discoveryRepos: { trending: [{ id: 1 }] } as never,
      subscriptionRepos: { trending: [{ id: 2 }] } as never,
      analyzingGistIds: new Set(['temporary']),
    });
    window.localStorage.setItem('github-stars-search-history', JSON.stringify(['react', 'vite']));
    window.localStorage.setItem('lastSearchTime', '2026-09-30T00:00:00.000Z');

    const state = useAppStore.getState();
    const partialize = appPersistenceOptions.partialize;
    if (!partialize) throw new Error('Missing persistence partialize');
    const persisted = partialize(state) as Record<string, unknown>;
    const document = await createBackupDocument();
    const expectedKeys = Object.keys(persisted)
      .filter((key) => !['user', 'githubToken', 'isAuthenticated', 'analyzingGistIds'].includes(key))
      .concat(['subscriptionChannels', 'repositoryChat', 'discoveryAnalyses', 'searchHistory', 'lastSearchTime'])
      .sort();

    expect(document.version).toBe('2.0');
    expect(document.appVersion).toBe(currentVersion);
    expect(Object.keys(document.data).sort()).toEqual(expectedKeys);
    expect(document.data).not.toHaveProperty('githubToken');
    expect(document.data).not.toHaveProperty('discoveryRepos');
    expect(document.data).not.toHaveProperty('subscriptionRepos');
    expect(document.data).not.toHaveProperty('analyzingGistIds');
    expect(document.data.releaseSubscriptions).toEqual([12]);
    expect(document.data.readReleases).toEqual([34]);
    expect(document.data.repositoryChat).toEqual(emptyChat);
    expect(document.data.discoveryAnalyses).toEqual(emptyAnalyses);
    expect(document.data.searchHistory).toEqual(['react', 'vite']);
    expect(document.data.lastSearchTime).toBe('2026-09-30T00:00:00.000Z');
    expect(document.data.aiConfigs?.[0].apiKey).toBe('ai-secret');
    expect(document.data.embeddingConfigs?.[0].apiKey).toBe('embedding-secret');
    expect(document.data.webdavConfigs?.[0].password).toBe('dav-secret');
    expect(document.data.rpcDownloadConfig?.secret).toBe('rpc-secret');
    expect(document.data.vectorSearchConfig?.authToken).toBe('vector-secret');

    useAppStore.setState({ includeKeysInBackup: false });
    const masked = await createBackupDocument();
    expect(masked.data.aiConfigs?.[0].apiKey).toBe('***');
    expect(masked.data.embeddingConfigs?.[0].apiKey).toBe('***');
    expect(masked.data.webdavConfigs?.[0].password).toBe('***');
    expect(masked.data.rpcDownloadConfig?.secret).toBe('***');
    expect(masked.data.vectorSearchConfig?.authToken).toBe('***');
  });

  it('aborts complete backup when a required IndexedDB snapshot fails', async () => {
    snapshots.exportAnalyses.mockRejectedValue(new Error('analysis read failed'));
    await expect(createBackupDocument()).rejects.toThrow('analysis read failed');
  });

  it('accepts wrapped local files and legacy flat WebDAV backups, and rejects malformed files', () => {
    expect(parseBackupDocument({ version: '1.0', exportDate: 'now', appVersion: '0.8.0', data: {} }).data).toEqual({});
    expect(parseBackupDocument({ version: '1.2', exportedAt: 'then', repositories: [], routeMode: 'browser' })).toMatchObject({
      version: '1.2', exportDate: 'then', data: { repositories: [], routeMode: 'browser' },
    });
    expect(() => parseBackupDocument({ version: '2.0', exportDate: 'now', appVersion: currentVersion, data: {} }))
      .toThrow('Invalid repository chat snapshot');
    expect(() => parseBackupDocument({
      version: '2.0', exportDate: 'now', appVersion: currentVersion,
      data: {
        repositoryChat: { ...emptyChat, messages: [{ id: 'broken' }] },
        discoveryAnalyses: emptyAnalyses,
        searchHistory: [],
        lastSearchTime: null,
      },
    })).toThrow('Invalid repository chat snapshot store: messages');
    expect(() => parseBackupDocument({ version: '7.0', data: {} })).toThrow('Unsupported backup version');
  });

  it.each(['merge', 'replace'] as const)('restores full snapshots in %s mode and keeps local masked secrets', async (mode) => {
    useAppStore.setState({
      repositories: [{ id: 1, full_name: 'owner/old' } as never, { id: 2, full_name: 'owner/keep' } as never],
      aiConfigs: [{ id: 'ai', name: 'AI', apiKey: 'local-ai-secret', baseUrl: '', model: '', isActive: false }],
      embeddingConfigs: [{ id: 'embedding', name: 'Embed', apiType: 'openai', baseUrl: '', apiKey: 'local-embedding-secret', model: '', dimensions: 3, isActive: false }],
      webdavConfigs: [{ id: 'dav', name: 'DAV', url: '', username: '', password: 'local-dav-secret', path: '', isActive: false }],
      rpcDownloadConfig: { enabled: false, host: '', port: 6800, secret: 'local-rpc-secret' },
      vectorSearchConfig: { ...useAppStore.getState().vectorSearchConfig, authToken: 'local-vector-secret' },
    });
    window.localStorage.setItem('github-stars-search-history', JSON.stringify(['local-query']));
    const document = parseBackupDocument({
      version: '2.0', exportDate: 'now', appVersion: currentVersion,
      data: {
        includeKeysInBackup: false,
        repositories: [{ id: 1, full_name: 'owner/new' }],
        releaseSubscriptions: [7],
        readReleases: [8],
        readForks: [9],
        releaseExpandedRepositories: [11],
        forkExpandedRepositories: [12],
        aiConfigs: [{ id: 'ai', name: 'AI', apiKey: '***', baseUrl: '', model: '', isActive: false }, { id: 'new-ai', name: 'New', apiKey: '***', baseUrl: '', model: '', isActive: false }],
        embeddingConfigs: [{ id: 'embedding', name: 'Embed', apiType: 'openai', baseUrl: '', apiKey: '***', model: '', dimensions: 3, isActive: false }],
        webdavConfigs: [{ id: 'dav', name: 'DAV', url: '', username: '', password: '***', path: '', isActive: false }],
        rpcDownloadConfig: { enabled: false, host: '', port: 6800, secret: '***' },
        vectorSearchConfig: { ...useAppStore.getState().vectorSearchConfig, authToken: '***' },
        repositoryChat: emptyChat,
        discoveryAnalyses: emptyAnalyses,
        searchHistory: ['backup-query'],
        lastSearchTime: null,
      },
    });

    await restoreBackupDocument(document, mode);

    const restored = useAppStore.getState();
    expect(restored.repositories.map((repo) => repo.id)).toEqual(mode === 'merge' ? [1, 2] : [1]);
    expect(restored.repositories[0].full_name).toBe('owner/new');
    expect(restored.releaseSubscriptions).toEqual(new Set([7]));
    expect(restored.readReleases).toEqual(new Set([8]));
    expect(restored.readForks).toEqual(new Set([9]));
    expect(restored.releaseExpandedRepositories).toEqual(new Set([11]));
    expect(restored.forkExpandedRepositories).toEqual(new Set([12]));
    expect(restored.aiConfigs.find((config) => config.id === 'ai')?.apiKey).toBe('local-ai-secret');
    expect(restored.aiConfigs.find((config) => config.id === 'new-ai')?.apiKey).toBe('');
    expect(restored.embeddingConfigs[0].apiKey).toBe('local-embedding-secret');
    expect(restored.webdavConfigs[0].password).toBe('local-dav-secret');
    expect(restored.rpcDownloadConfig.secret).toBe('local-rpc-secret');
    expect(restored.vectorSearchConfig.authToken).toBe('local-vector-secret');
    expect(snapshots.restoreChat).toHaveBeenCalledWith(emptyChat, mode);
    expect(snapshots.restoreAnalyses).toHaveBeenCalledWith(emptyAnalyses, mode);
    expect(JSON.parse(window.localStorage.getItem('github-stars-search-history') || '[]')).toEqual(
      mode === 'merge' ? ['backup-query', 'local-query'] : ['backup-query'],
    );
    expect(window.localStorage.getItem('lastSearchTime')).toBeNull();
  });

  it('rolls back external snapshots when a later restore step fails', async () => {
    const previousChat = { ...emptyChat, sessions: [{
      id: 'current', repoId: 1, repoFullName: 'owner/current', sourceRefSha: 'sha', title: 'Current',
      createdAt: 'now', updatedAt: 'now',
    }] };
    const previousAnalyses = { '1': { ai_summary: 'current' } };
    snapshots.exportChat.mockResolvedValue(previousChat);
    snapshots.exportAnalyses.mockResolvedValue(previousAnalyses);
    snapshots.restoreChat.mockRejectedValueOnce(new Error('chat write failed'));
    const originalRepositories = useAppStore.getState().repositories;
    const document = parseBackupDocument({
      version: '2.0', exportDate: 'now', appVersion: currentVersion,
      data: {
        repositoryChat: emptyChat,
        discoveryAnalyses: { '2': { ai_summary: 'backup' } },
        searchHistory: [],
        lastSearchTime: null,
      },
    });

    await expect(restoreBackupDocument(document, 'replace')).rejects.toThrow('chat write failed');

    expect(snapshots.restoreAnalyses).toHaveBeenNthCalledWith(1, { '2': { ai_summary: 'backup' } }, 'replace');
    expect(snapshots.restoreAnalyses).toHaveBeenNthCalledWith(2, previousAnalyses, 'replace');
    expect(snapshots.restoreChat).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().repositories).toBe(originalRepositories);
  });

  it('replaces a legacy WebDAV backup through the shared partial restore path', async () => {
    const document = parseBackupDocument({
      version: '1.2', exportedAt: 'then', includeKeysInBackup: false,
      repositories: [{ id: 99, full_name: 'legacy/repo' }],
    });
    await restoreBackupDocument(document, 'replace');
    expect(useAppStore.getState().repositories.map((repo) => repo.id)).toEqual([99]);
    expect(snapshots.restoreChat).not.toHaveBeenCalled();
  });
});
