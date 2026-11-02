import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseTimeline } from './ReleaseTimeline';
import { useAppStore } from '../store/useAppStore';
import { defaultReleaseSourceSettings } from '../types';
import type { AssetFilter, Release, Repository } from '../types';

const { markAllReleasesOnBackend } = vi.hoisted(() => ({
  markAllReleasesOnBackend: vi.fn(),
}));

// 设备检测结果由用例注入：useDeviceTarget 依赖真实 navigator UA，测试不可控。
const deviceState = vi.hoisted(() => ({
  current: {
    platform: null as 'windows' | 'macos' | 'linux' | 'android' | null,
    architecture: undefined as 'x64' | 'arm64' | 'x86' | 'arm' | undefined,
    architectureSource: 'none' as 'ua-ch' | 'platform-string' | 'webgl' | 'none',
    architectureSettled: true,
  },
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('../services/githubApi', () => ({
  GitHubApiService: vi.fn(),
}));

vi.mock('../services/backendAdapter', () => ({
  backend: { markAllReleasesAsRead: markAllReleasesOnBackend },
}));

vi.mock('../services/autoSync', () => ({
  forceSyncToBackend: vi.fn(),
}));

const toastMock = vi.fn();
const confirmMock = vi.fn();

vi.mock('../hooks/useDialog', () => ({
  useDialog: () => ({
    toast: toastMock,
    confirm: confirmMock,
  }),
}));

vi.mock('../hooks/useDeviceTarget', () => ({
  useDeviceTarget: () => deviceState.current,
}));

const repository: Repository = {
  id: 7,
  name: 'repo',
  full_name: 'owner/repo',
  description: null,
  html_url: 'https://github.com/owner/repo',
  stargazers_count: 1,
  forks_count: 0,
  forks: 0,
  language: 'TypeScript',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  pushed_at: '2026-08-01T00:00:00.000Z',
  topics: [],
  owner: { login: 'owner', avatar_url: 'https://github.com/owner.png' },
};

// 带“资产已更新”标识的未读 Release：展开资产按钮会触发 markReleaseAsRead，
// 真实 store 会同时清空 updated_asset_ids 并生成新的 releases 数组。
const createRelease = (): Release => ({
  id: 101,
  tag_name: 'v1.0.0',
  name: null,
  body: null,
  published_at: '2026-08-20T00:00:00.000Z',
  html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
  prerelease: false,
  repository: {
    id: repository.id,
    full_name: repository.full_name,
    name: repository.name,
  },
  assets: [
    {
      id: 501,
      name: 'app.zip',
      size: 1024,
      download_count: 3,
      browser_download_url: 'https://github.com/owner/repo/releases/download/v1.0.0/app.zip',
      content_type: 'application/zip',
      created_at: '2026-08-21T00:00:00.000Z',
      updated_at: '2026-08-21T00:00:00.000Z',
    },
  ],
  updated_asset_ids: [501],
});

let storeState: ReturnType<typeof createStoreState>;

const baseStoreState = () => ({
  releases: [createRelease()],
  repositories: [repository],
  releaseSubscriptions: new Set<number>([repository.id]),
  releaseSourceSettings: defaultReleaseSourceSettings,
  readReleases: new Set<number>(),
  githubToken: 'token',
  language: 'zh' as const,
  assetFilters: [] as AssetFilter[],
  addReleases: vi.fn(),
  upsertReleases: vi.fn(),
  markReleaseAsRead: vi.fn(),
  markAssetAsRead: vi.fn(),
  markAllReleasesAsRead: vi.fn(),
  batchUnsubscribeReleases: vi.fn(),
  removeReleasesByRepoFullName: vi.fn(),
  updateRepository: vi.fn(),
  removeReleaseSourceRepository: vi.fn(),
  updateReleaseSourceRepository: vi.fn(),
  addReleaseSourceRepository: vi.fn(),
  removeReleaseSourceRepositoryByName: vi.fn(),
  releaseViewMode: 'list' as 'list' | 'timeline',
  releaseSelectedFilters: [] as string[],
  releaseSearchQuery: '',
  releaseExpandedRepositories: new Set<number>([7]),
  releaseIsRefreshing: false,
  setReleaseViewMode: vi.fn(),
  toggleReleaseSelectedFilter: vi.fn(),
  clearReleaseSelectedFilters: vi.fn(),
  setReleaseSearchQuery: vi.fn(),
  toggleReleaseExpandedRepository: vi.fn(),
  setReleaseIsRefreshing: vi.fn(),
  includePreRelease: false,
  setIncludePreRelease: vi.fn(),
  releaseShowMode: 'unread' as 'all' | 'unread',
  setReleaseShowMode: vi.fn(),
  releaseLatestMode: 'all' as const,
  setReleaseLatestMode: vi.fn(),
  rpcDownloadConfig: { enabled: false, host: '', secret: '' },
  aiConfigs: [] as Array<{ id: string }>,
  activeAIConfig: null as string | null,
});

const createStoreState = (overrides: Partial<ReturnType<typeof baseStoreState>> = {}) => ({
  ...baseStoreState(),
  ...overrides,
});

const mockUseAppStore = vi.mocked(useAppStore);

describe('ReleaseTimeline unread snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState = createStoreState();

    mockUseAppStore.mockImplementation(((selector?: (s: typeof storeState) => unknown) =>
      selector ? selector(storeState) : storeState) as unknown as typeof useAppStore);
    Object.assign(mockUseAppStore, {
      getState: vi.fn(() => storeState),
      setState: vi.fn((update: Partial<typeof storeState>) => Object.assign(storeState, update)),
    });

    // 复刻真实 store 的 markReleaseAsRead 行为：标记已读并清空
    // updated_asset_ids 时会生成新的 releases 数组（引用变化）。
    markAllReleasesOnBackend.mockResolvedValue(undefined);
    storeState.markAllReleasesAsRead = vi.fn(() => {
      storeState.readReleases = new Set(storeState.releases.map(release => release.id));
    });
    storeState.markReleaseAsRead = vi.fn((releaseId: number) => {
      storeState.readReleases = new Set(storeState.readReleases);
      storeState.readReleases.add(releaseId);
      storeState.releases = storeState.releases.map(r =>
        r.id === releaseId && (r.updated_asset_ids?.length ?? 0) > 0
          ? { ...r, updated_asset_ids: [] }
          : r
      );
    }) as unknown as typeof storeState.markReleaseAsRead;
  });

  it('restores the prior read state when backend bulk mark-all fails', async () => {
    const user = userEvent.setup();
    storeState.readReleases = new Set([999]);
    markAllReleasesOnBackend.mockRejectedValueOnce(new Error('backend offline'));

    render(<ReleaseTimeline />);
    await user.click(screen.getByRole('button', { name: '全部已读' }));

    await waitFor(() => {
      expect(storeState.readReleases).toEqual(new Set([999]));
      expect(toastMock).toHaveBeenCalledWith('标记全部已读失败', 'error');
    });
  });

  it('expanding an asset-updated release keeps it visible under unread-only mode', async () => {
    const user = userEvent.setup();
    render(<ReleaseTimeline />);

    const itemTexts = await screen.findAllByText('owner/repo');
    expect(itemTexts.length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '显示下载资产' }));

    await waitFor(() => {
      expect(storeState.markReleaseAsRead).toHaveBeenCalledWith(101);
    });

    // 标记已读后条目必须保留在“仅显示未读”列表中，直到快照真正刷新
    await waitFor(() => {
      expect(screen.queryAllByText('owner/repo')).toHaveLength(itemTexts.length);
    });
    // 展开确实生效：资产行可见
    expect(await screen.findByText('app.zip')).toBeInTheDocument();
  });

  it('shows only matching assets by default and can reveal all assets per card', async () => {
    const user = userEvent.setup();
    const release = createRelease();
    release.assets = [
      release.assets[0],
      {
        ...release.assets[0],
        id: 502,
        name: 'notes.txt',
        browser_download_url: 'https://github.com/owner/repo/releases/download/v1.0.0/notes.txt',
      },
    ];
    release.zipball_url = 'https://api.github.com/repos/owner/repo/zipball/v1.0.0';
    storeState = createStoreState({
      releases: [release],
      readReleases: new Set([release.id]),
      releaseSelectedFilters: ['app-filter'],
      assetFilters: [{ id: 'app-filter', name: 'App', keywords: ['app'] }],
      releaseViewMode: 'timeline',
      releaseShowMode: 'all',
    });
    mockUseAppStore.mockImplementation(((selector?: (s: typeof storeState) => unknown) =>
      selector ? selector(storeState) : storeState) as unknown as typeof useAppStore);
    Object.assign(mockUseAppStore, {
      getState: vi.fn(() => storeState),
      setState: vi.fn((update: Partial<typeof storeState>) => Object.assign(storeState, update)),
    });

    render(<ReleaseTimeline />);
    await user.click(screen.getByRole('button', { name: '显示下载资产' }));

    expect(await screen.findByText('app.zip')).toBeInTheDocument();
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
    expect(screen.queryByText(/Source code \(v1\.0\.0\.zip\)/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '显示全部资产' }));
    expect(await screen.findByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByText(/Source code \(v1\.0\.0\.zip\)/)).toBeInTheDocument();
  });
});

describe('ReleaseTimeline 当前系统筛选', () => {
  const makeRelease = (id: number, assetNames: string[]): Release => ({
    id,
    tag_name: `v${id}`,
    name: null,
    body: null,
    published_at: '2026-08-20T00:00:00.000Z',
    html_url: `https://github.com/owner/repo/releases/tag/v${id}`,
    prerelease: false,
    repository: {
      id: repository.id,
      full_name: repository.full_name,
      name: repository.name,
    },
    // 资产 id/url 由文件名派生，保证每个候选资产都有稳定标识。
    assets: assetNames.map((assetName, assetIndex) => ({
      id: 600 + assetIndex,
      name: assetName,
      size: 1024,
      download_count: 0,
      browser_download_url: `https://github.com/owner/repo/releases/download/v${id}/${assetName}`,
      content_type: 'application/octet-stream',
      created_at: '2026-08-21T00:00:00.000Z',
      updated_at: '2026-08-21T00:00:00.000Z',
    })),
  });

  const activate = (overrides: Partial<ReturnType<typeof baseStoreState>> = {}) => {
    storeState = createStoreState({
      releaseSelectedFilters: ['builtin-current-system'],
      releaseShowMode: 'all',
      releaseViewMode: 'list',
      releaseLatestMode: 'all',
      ...overrides,
    });
    mockUseAppStore.mockImplementation(((selector?: (s: typeof storeState) => unknown) =>
      selector ? selector(storeState) : storeState) as unknown as typeof useAppStore);
    Object.assign(mockUseAppStore, {
      getState: vi.fn(() => storeState),
      setState: vi.fn((update: Partial<typeof storeState>) => Object.assign(storeState, update)),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    deviceState.current = {
      platform: null,
      architecture: undefined,
      architectureSource: 'none',
      architectureSettled: true,
    };
  });

  it('侧栏始终渲染内置行，且不提供编辑/删除操作', () => {
    activate({ releaseSelectedFilters: [] });
    render(<ReleaseTimeline />);

    const row = document.querySelector('#asset-filter-panel')!.firstElementChild as HTMLElement;
    expect(within(row).getByText('当前系统')).toBeInTheDocument();
    expect(within(row).getByText('内置')).toBeInTheDocument();
    expect(within(row).queryByTitle('编辑')).not.toBeInTheDocument();
    expect(within(row).queryByTitle('删除')).not.toBeInTheDocument();
  });

  it('按检测到的设备平台过滤 Release 与默认展示的资产', async () => {
    const user = userEvent.setup();
    deviceState.current = {
      platform: 'macos',
      architecture: 'arm64',
      architectureSource: 'ua-ch',
      architectureSettled: true,
    };
    activate({ releases: [makeRelease(801, ['App-arm64.dmg', 'App-setup.exe', 'App-x86_64.AppImage'])] });

    render(<ReleaseTimeline />);
    await user.click(screen.getByRole('button', { name: '显示下载资产' }));

    expect(await screen.findByText('App-arm64.dmg')).toBeInTheDocument();
    expect(screen.queryByText('App-setup.exe')).not.toBeInTheDocument();
    expect(screen.queryByText('App-x86_64.AppImage')).not.toBeInTheDocument();
  });

  it('设备平台无法识别时不会清空列表', async () => {
    activate({ releases: [makeRelease(802, ['App-setup.exe'])] });
    render(<ReleaseTimeline />);

    // 平台未知时不按内置筛选裁剪：Release 与资产都照常渲染。
    expect((await screen.findAllByText('owner/repo')).length).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getByRole('button', { name: '显示下载资产' }));
    expect(await screen.findByText('App-setup.exe')).toBeInTheDocument();
  });

  it('与普通过滤器在 Release 级取 OR，资产级取并集', async () => {
    const user = userEvent.setup();
    deviceState.current = {
      platform: 'macos',
      architecture: 'arm64',
      architectureSource: 'ua-ch',
      architectureSettled: true,
    };
    activate({
      releaseSelectedFilters: ['builtin-current-system', 'preset-windows'],
      releases: [makeRelease(803, ['App-arm64.dmg', 'App-setup.exe'])],
    });

    render(<ReleaseTimeline />);
    await user.click(screen.getByRole('button', { name: '显示下载资产' }));

    expect(await screen.findByText('App-arm64.dmg')).toBeInTheDocument();
    expect(await screen.findByText('App-setup.exe')).toBeInTheDocument();
  });

  it('空态给出设备专属文案并可一键关闭该过滤器', async () => {
    const user = userEvent.setup();
    deviceState.current = {
      platform: 'macos',
      architecture: 'arm64',
      architectureSource: 'ua-ch',
      architectureSettled: true,
    };
    activate({ releases: [makeRelease(804, ['App-setup.exe'])] });

    render(<ReleaseTimeline />);
    expect(await screen.findByText('没有找到适用于 macOS · Apple Silicon 的资产')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭「当前系统」过滤器' }));
    expect(storeState.toggleReleaseSelectedFilter).toHaveBeenCalledWith('builtin-current-system');
  });
});
