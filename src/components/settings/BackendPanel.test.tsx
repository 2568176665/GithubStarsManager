import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendPanel } from './BackendPanel';

const mocks = vi.hoisted(() => {
  const storeState = {
    repositories: [],
    releases: [],
    aiConfigs: [],
    webdavConfigs: [],
    activeAIConfig: null,
    activeWebDAVConfig: null,
    hiddenDefaultCategoryIds: [],
    categoryOrder: [],
    customCategories: [],
    assetFilters: {},
    collapsedSidebarCategoryCount: 20,
    backendApiSecret: null,
    githubToken: 'ghp-local-token',
    setBackendApiSecret: vi.fn(),
    setRepositories: vi.fn(),
    setReleases: vi.fn(),
    setAIConfigs: vi.fn(),
    setWebDAVConfigs: vi.fn(),
    showDefaultCategory: vi.fn(),
    hideDefaultCategory: vi.fn(),
  };

  return {
    storeState,
    useAppStore: vi.fn(() => storeState),
    backend: {
      init: vi.fn(),
      checkHealth: vi.fn(),
      verifyAuth: vi.fn(),
      isAvailable: true,
      syncRepositories: vi.fn(),
      syncReleases: vi.fn(),
      syncAIConfigs: vi.fn(),
      syncWebDAVConfigs: vi.fn(),
      syncSettings: vi.fn(),
      fetchRepositories: vi.fn(),
      fetchReleases: vi.fn(),
      fetchAIConfigs: vi.fn(),
      fetchWebDAVConfigs: vi.fn(),
      fetchSettings: vi.fn(),
    },
    tryRestoreAuthFromBackend: vi.fn(),
    syncLocalGitHubTokenToBackend: vi.fn(),
    syncToBackend: vi.fn(),
    toast: vi.fn(),
    confirm: vi.fn(),
  };
});

vi.mock('../../store/useAppStore', () => ({ useAppStore: mocks.useAppStore }));
vi.mock('../../services/backendAdapter', () => ({ backend: mocks.backend }));
vi.mock('../../services/autoSync', () => ({
  tryRestoreAuthFromBackend: mocks.tryRestoreAuthFromBackend,
  syncLocalGitHubTokenToBackend: mocks.syncLocalGitHubTokenToBackend,
  syncToBackend: mocks.syncToBackend,
}));
vi.mock('../../hooks/useDialog', () => ({
  useDialog: () => ({ toast: mocks.toast, confirm: mocks.confirm }),
}));

const health = { version: '0.1.0', timestamp: '2026-08-19T00:00:00Z' };
const t = (_zh: string, en: string) => en;

describe('BackendPanel token synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backend.init.mockResolvedValue(undefined);
    mocks.backend.verifyAuth.mockResolvedValue(true);
    mocks.syncLocalGitHubTokenToBackend.mockResolvedValue(true);
    mocks.tryRestoreAuthFromBackend.mockResolvedValue(false);
    mocks.syncToBackend.mockResolvedValue(true);
    mocks.confirm.mockResolvedValue(true);
    mocks.backend.checkHealth.mockResolvedValue(null);
    mocks.backend.fetchRepositories.mockResolvedValue({ repositories: [], total: 0 });
    mocks.backend.fetchReleases.mockResolvedValue({ releases: [], total: 0 });
    mocks.backend.fetchAIConfigs.mockResolvedValue([]);
    mocks.backend.fetchWebDAVConfigs.mockResolvedValue([]);
    mocks.backend.fetchSettings.mockResolvedValue({ hiddenDefaultCategoryIds: [] });
  });

  it('syncs the local GitHub token when the backend becomes reachable on panel mount', async () => {
    mocks.backend.checkHealth.mockResolvedValue(health);

    render(<BackendPanel t={t} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.syncLocalGitHubTokenToBackend).toHaveBeenCalledOnce();
    expect(screen.getByText('Connected')).toBeTruthy();
  });

  it('syncs the local GitHub token after a successful manual test connection', async () => {
    mocks.backend.checkHealth.mockResolvedValueOnce(null).mockResolvedValue(health);

    render(<BackendPanel t={t} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.syncLocalGitHubTokenToBackend).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Test Connection'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.syncLocalGitHubTokenToBackend).toHaveBeenCalledOnce();
  });

  it('does not sync the token when the backend is unreachable', async () => {
    mocks.backend.checkHealth.mockResolvedValue(null);

    render(<BackendPanel t={t} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.syncLocalGitHubTokenToBackend).not.toHaveBeenCalled();
    expect(screen.getByText('Not Connected')).toBeTruthy();
  });

  it('starts a local-to-backend sync from the first sync button and reports success', async () => {
    render(<BackendPanel t={t} />);

    const syncButtons = screen.getAllByRole('button', { name: 'Start Sync' });
    expect(syncButtons).toHaveLength(2);
    fireEvent.click(syncButtons[0]);

    await waitFor(() => expect(mocks.syncToBackend).toHaveBeenCalledOnce());
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Synced to backend'), 'success');
  });

  it('confirms and applies backend data from the second sync button', async () => {
    mocks.backend.fetchRepositories.mockResolvedValue({ repositories: [{ id: 1 }], total: 1 });
    mocks.backend.fetchReleases.mockResolvedValue({ releases: [{ id: 2 }], total: 1 });
    mocks.backend.fetchAIConfigs.mockResolvedValue([{ id: 'ai-1' }]);
    mocks.backend.fetchWebDAVConfigs.mockResolvedValue([{ id: 'webdav-1' }]);

    render(<BackendPanel t={t} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start Sync' })[1]);

    await waitFor(() => expect(mocks.backend.fetchSettings).toHaveBeenCalledOnce());
    expect(mocks.confirm).toHaveBeenCalledWith(
      'Sync from Backend',
      'Syncing from backend will overwrite local data. Continue?',
      { type: 'warning' },
    );
    expect(mocks.storeState.setRepositories).toHaveBeenCalledWith([{ id: 1 }]);
    expect(mocks.storeState.setReleases).toHaveBeenCalledWith([{ id: 2 }]);
    expect(mocks.storeState.setAIConfigs).toHaveBeenCalledWith([{ id: 'ai-1' }]);
    expect(mocks.storeState.setWebDAVConfigs).toHaveBeenCalledWith([{ id: 'webdav-1' }]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Synced from backend'), 'success');
  });

  it('does not overwrite local data when the pull sync is cancelled', async () => {
    mocks.confirm.mockResolvedValue(false);

    render(<BackendPanel t={t} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start Sync' })[1]);

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    expect(mocks.backend.fetchRepositories).not.toHaveBeenCalled();
    expect(mocks.storeState.setRepositories).not.toHaveBeenCalled();
  });
});
