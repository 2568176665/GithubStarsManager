import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../../store/useAppStore';
import { useBackupActions } from './useBackupActions';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  confirm: vi.fn(),
  listFiles: vi.fn(),
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock('../../../hooks/useDialog', () => ({
  useDialog: () => ({ toast: mocks.toast, confirm: mocks.confirm }),
}));
vi.mock('../../../services/webdavService', () => ({
  WebDAVService: vi.fn(function WebDAVService() {
    return {
      listFiles: mocks.listFiles,
      downloadFile: mocks.downloadFile,
      uploadFile: mocks.uploadFile,
    };
  }),
}));

describe('useBackupActions asset filter compatibility', () => {
  type TestStoreState = Record<string, unknown>;
  const store = useAppStore as unknown as {
    mockImplementation: (implementation: (selector?: (state: TestStoreState) => unknown) => unknown) => unknown;
    getState: () => TestStoreState;
    setState: (partial: Partial<TestStoreState>) => void;
  };
  let storeState: TestStoreState;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockResolvedValue(true);
    mocks.listFiles.mockResolvedValue(['github-stars-backup-2026-09-30.json']);
    mocks.downloadFile.mockResolvedValue(JSON.stringify({
      includeKeysInBackup: false,
      assetFilters: [{
        id: 'release-assets',
        name: '  Builds  ',
        keywords: [' MSI ', 'msi', '', 12],
        excludeKeywords: [' Source ', 'source'],
        includeRepos: ['owner/repo', 'OWNER/REPO'],
        alwaysExcludeRepos: ['other/repo'],
        excludeRepos: ['legacy/repo'],
      }],
    }));
    mocks.uploadFile.mockResolvedValue(true);
    storeState = {
      language: 'zh',
      routeMode: 'auto',
      includeKeysInBackup: false,
      assetFilters: [{ id: 'release-assets', name: 'Builds', keywords: ['msi'] }],
      webdavConfigs: [{ id: 'dav', name: 'DAV', url: 'https://example.test', username: 'user', password: 'pass', path: '/', isActive: true }],
      activeWebDAVConfig: 'dav',
      setLastBackup: vi.fn(),
      repositories: [],
      releases: [],
      customCategories: [],
      hiddenDefaultCategoryIds: [],
      aiConfigs: [],
      rpcDownloadConfig: { enabled: false, host: '', port: 6800, secret: '' },
      releaseSubscriptions: new Set(),
      releaseSourceSettings: {},
      readReleases: new Set(),
      deleteCustomCategory: vi.fn(),
      addCustomCategory: vi.fn(),
      hideDefaultCategory: vi.fn(),
      showDefaultCategory: vi.fn(),
      deleteAIConfig: vi.fn(),
      updateAIConfig: vi.fn(),
      addAIConfig: vi.fn(),
      deleteWebDAVConfig: vi.fn(),
      updateWebDAVConfig: vi.fn(),
      addWebDAVConfig: vi.fn(),
      setRpcDownloadConfig: vi.fn(),
      setRouteMode: vi.fn(),
      setReleaseSourceSettings: vi.fn(),
      setRepositories: vi.fn(),
      setReleases: vi.fn(),
    };
    store.mockImplementation((selector) => selector ? selector(storeState) : storeState);
    store.getState = () => storeState;
    store.setState = partial => { storeState = { ...storeState, ...partial }; };
  });

  afterEach(() => vi.restoreAllMocks());

  it('includes asset filters in WebDAV backup and normalizes them on restore', async () => {
    const { result } = renderHook(() => useBackupActions({ t: (zh) => zh }));

    await act(async () => result.current.backup());
    const backupJson = mocks.uploadFile.mock.calls[0][1] as string;
    expect(JSON.parse(backupJson).assetFilters).toEqual(storeState.assetFilters);

    await act(async () => result.current.restore());

    expect(storeState.assetFilters).toEqual([{
      id: 'release-assets',
      name: 'Builds',
      keywords: ['MSI'],
      excludeKeywords: ['Source'],
      includeRepos: ['owner/repo'],
      alwaysExcludeRepos: ['other/repo'],
    }]);
  });
});
