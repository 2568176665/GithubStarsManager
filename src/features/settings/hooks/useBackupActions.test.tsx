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
  createBackupDocument: vi.fn(),
  parseBackupDocument: vi.fn(),
  restoreBackupDocument: vi.fn(),
}));

vi.mock('../backup/backupService', () => ({
  createBackupDocument: mocks.createBackupDocument,
  parseBackupDocument: mocks.parseBackupDocument,
  restoreBackupDocument: mocks.restoreBackupDocument,
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
      version: '1.2',
      exportedAt: '2026-09-30T00:00:00.000Z',
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
    mocks.createBackupDocument.mockResolvedValue({
      version: '2.0',
      exportDate: '2026-09-30T00:00:00.000Z',
      appVersion: '0.8.4',
      data: { assetFilters: [{ id: 'release-assets', name: 'Builds', keywords: ['msi'] }] },
    });
    mocks.parseBackupDocument.mockReturnValue({ version: '1.2', exportDate: '2026-09-30T00:00:00.000Z', appVersion: '0.8.4', data: {} });
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uploads the full backup document and restores the latest file through the shared restorer', async () => {
    const { result } = renderHook(() => useBackupActions({ t: (zh) => zh }));

    await act(async () => result.current.backup());
    const backupJson = mocks.uploadFile.mock.calls[0][1] as string;
    expect(JSON.parse(backupJson)).toMatchObject({
      version: '2.0',
      data: { assetFilters: [{ id: 'release-assets', name: 'Builds', keywords: ['msi'] }] },
    });

    await act(async () => result.current.restore());

    expect(mocks.parseBackupDocument).toHaveBeenCalledWith(expect.objectContaining({ version: '1.2' }));
    expect(mocks.restoreBackupDocument).toHaveBeenCalledWith(expect.objectContaining({ version: '1.2' }), 'replace');
  });
});
