import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const storeState = {
    isAuthenticated: true,
    currentView: 'repositories',
    selectedCategory: 'all',
    theme: 'light',
    hasHydrated: true,
    searchResults: [],
    searchFilters: {
      query: '',
      tags: [],
      languages: [],
      platforms: [],
      licenses: [],
      sortBy: 'stars',
      sortOrder: 'desc',
    },
    repositories: [],
    githubToken: 'ghp-local-token',
    setSelectedCategory: vi.fn(),
    setCurrentView: vi.fn(),
  };

  return {
    storeState,
    useAppStore: vi.fn((selector?: (state: typeof storeState) => unknown) =>
      selector ? selector(storeState) : storeState,
    ),
    backend: {
      init: vi.fn(),
      isAvailable: true,
      syncSettings: vi.fn(),
    },
    syncFromBackend: vi.fn(),
    startAutoSync: vi.fn(),
    stopAutoSync: vi.fn(),
    tryRestoreAuthFromBackend: vi.fn(),
    useAutoUpdateCheck: vi.fn(),
    loadedViews: new Set<string>(),
  };
});

Object.assign(mocks.useAppStore, {
  getState: vi.fn(() => mocks.storeState),
});

vi.mock('./store/useAppStore', () => ({ useAppStore: mocks.useAppStore }));
vi.mock('./services/backendAdapter', () => ({ backend: mocks.backend }));
vi.mock('./services/logger', () => ({
  logger: {
    setLevel: vi.fn(),
    isDebugMode: vi.fn(() => false),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    errorFromError: vi.fn(),
  },
}));
vi.mock('./hooks/useAutoUpdateCheck', () => ({ useAutoUpdateCheck: mocks.useAutoUpdateCheck }));
vi.mock('./services/autoSync', async () => {
  const actual = await vi.importActual<typeof import('./services/autoSync')>('./services/autoSync');
  return {
    ...actual,
    syncFromBackend: mocks.syncFromBackend,
    startAutoSync: mocks.startAutoSync,
    stopAutoSync: mocks.stopAutoSync,
    tryRestoreAuthFromBackend: mocks.tryRestoreAuthFromBackend,
  };
});

vi.mock('./components/LoginScreen', () => ({ LoginScreen: () => null }));
vi.mock('./components/Header', () => ({ Header: () => null }));
vi.mock('./components/SearchBar', () => ({ SearchBar: () => null }));
vi.mock('./components/RepositoryList', () => ({ RepositoryList: () => <div data-testid="repositories-view" /> }));
vi.mock('./components/CategorySidebar', () => ({ CategorySidebar: () => null }));
vi.mock('./components/ReleaseTimeline', () => {
  mocks.loadedViews.add('releases');
  return { ReleaseTimeline: () => <div data-testid="releases-view" /> };
});
vi.mock('./components/ForkTimeline', () => {
  mocks.loadedViews.add('forks');
  return { ForkTimeline: () => <div data-testid="forks-view" /> };
});
vi.mock('./components/SettingsPanel', () => {
  mocks.loadedViews.add('settings');
  return { SettingsPanel: () => <div data-testid="settings-view" /> };
});
vi.mock('./components/DebugModeIndicator', () => ({ DebugModeIndicator: () => null }));
vi.mock('./components/DiscoveryView', () => {
  mocks.loadedViews.add('subscription');
  return { DiscoveryView: () => <div data-testid="subscription-view" /> };
});
vi.mock('./components/GistView', () => {
  mocks.loadedViews.add('gists');
  return { GistView: () => <div data-testid="gists-view" /> };
});
vi.mock('./components/BackToTop', () => ({ BackToTop: () => null }));
vi.mock('./components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: unknown }) => children }));
vi.mock('./components/SyncModeChoiceModal', () => ({ SyncModeChoiceModal: () => null }));
vi.mock('./components/UpdateNotificationBanner', () => ({ UpdateNotificationBanner: () => null }));
vi.mock('./components/ListsPushIndicator', () => ({ ListsPushIndicator: () => null }));

import App from './App';

const RouteProbe = () => {
  const location = useLocation();
  return <div data-testid="route-path">{location.pathname}</div>;
};

let testNavigate: ReturnType<typeof useNavigate> | null = null;

const NavigationProbe = () => {
  testNavigate = useNavigate();
  return <RouteProbe />;
};

const renderApp = (initialEntry = '/', withRouteProbe = false) => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    {withRouteProbe && <NavigationProbe />}
    <App />
  </MemoryRouter>,
);

describe('App backend initialization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.storeState.currentView = 'repositories';
    mocks.loadedViews.clear();
    mocks.backend.isAvailable = true;
    mocks.backend.init.mockResolvedValue(undefined);
    mocks.tryRestoreAuthFromBackend.mockResolvedValue(false);
    mocks.startAutoSync.mockReturnValue(vi.fn());
    mocks.backend.syncSettings.mockImplementation(
      (_settings: Record<string, unknown>, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }),
    );
  });

  it('continues backend loading after a pending local token sync reaches its deadline', async () => {
    renderApp();

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.syncFromBackend).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(mocks.backend.syncSettings).toHaveBeenCalledOnce();
    expect(mocks.syncFromBackend).toHaveBeenCalledOnce();
    expect(mocks.startAutoSync).toHaveBeenCalledOnce();
  });

  it('renders repositories before dormant views load, then resolves every lazy primary view after a view switch', async () => {
    vi.useRealTimers();
    const { rerender } = renderApp();

    expect(screen.getByTestId('repositories-view')).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.loadedViews).toEqual(new Set());

    const lazyViews = [
      ['settings', 'settings-view'],
      ['subscription', 'subscription-view'],
      ['gists', 'gists-view'],
      ['releases', 'releases-view'],
      ['forks', 'forks-view'],
    ] as const;

    for (const [currentView, testId] of lazyViews) {
      await act(async () => {
        mocks.storeState.currentView = currentView;
        rerender(
          <MemoryRouter initialEntries={['/']}>
            <App />
          </MemoryRouter>,
        );
        await Promise.resolve();
      });
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(mocks.loadedViews).toContain(currentView);
    }
  });

  it('renders each primary view from its URL and canonicalizes unknown paths', async () => {
    vi.useRealTimers();
    const routes = [
      ['/', 'repositories-view'],
      ['/repositories', 'repositories-view'],
      ['/settings', 'settings-view'],
      ['/trending', 'subscription-view'],
      ['/gists', 'gists-view'],
      ['/releases', 'releases-view'],
      ['/forks', 'forks-view'],
    ] as const;

    for (const [path, testId] of routes) {
      mocks.storeState.currentView = 'repositories';
      const { unmount } = renderApp(path);
      expect(await screen.findByTestId(testId)).toBeInTheDocument();
      unmount();
    }

    mocks.storeState.currentView = 'repositories';
    renderApp('/not-a-view', true);
    expect(await screen.findByTestId('repositories-view')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('route-path')).toHaveTextContent('/'));
  });

  it('syncs direct URLs and store navigation without replacing browser history', async () => {
    vi.useRealTimers();
    mocks.storeState.currentView = 'repositories';
    mocks.storeState.setCurrentView.mockClear();
    const directUrlRender = renderApp('/settings');

    await waitFor(() => expect(mocks.storeState.setCurrentView).toHaveBeenCalledWith('settings'));
    directUrlRender.unmount();

    mocks.storeState.currentView = 'repositories';
    const routeRender = renderApp('/', true);
    mocks.storeState.currentView = 'settings';
    routeRender.rerender(
      <MemoryRouter initialEntries={['/']}>
        <NavigationProbe />
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('route-path')).toHaveTextContent('/settings'));

    act(() => testNavigate?.('/gists'));
    await waitFor(() => expect(screen.getByTestId('route-path')).toHaveTextContent('/gists'));
    act(() => testNavigate?.(-1));
    await waitFor(() => expect(screen.getByTestId('route-path')).toHaveTextContent('/settings'));
    expect(mocks.storeState.setCurrentView).toHaveBeenCalledWith('gists');
  });
});
