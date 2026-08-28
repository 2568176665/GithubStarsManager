import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';

const mocks = vi.hoisted(() => {
  const panel = (name: string) => () => <div data-testid={`settings-panel-${name}`}>{name}</div>;
  const storeState = {
    language: 'en',
    setCurrentView: vi.fn(),
  };

  return {
    storeState,
    useAppStore: vi.fn((selector?: (state: typeof storeState) => unknown) => (
      selector ? selector(storeState) : storeState
    )),
    backend: { isAvailable: true },
    isElectron: vi.fn(() => false),
    panels: {
      general: panel('general'),
      starSync: panel('star-sync'),
      ai: panel('ai'),
      webdav: panel('webdav'),
      backup: panel('backup'),
      backend: panel('backend'),
      category: panel('category'),
      menu: panel('menu'),
      data: panel('data'),
      logs: panel('logs'),
      network: panel('network'),
      vectorSearch: panel('vector-search'),
      mcp: panel('mcp'),
    },
  };
});

vi.mock('../store/useAppStore', () => ({ useAppStore: mocks.useAppStore }));
vi.mock('../services/backendAdapter', () => ({ backend: mocks.backend }));
vi.mock('../services/electronProxy', () => ({ isElectron: mocks.isElectron }));
vi.mock('./settings', () => ({
  GeneralPanel: mocks.panels.general,
  StarSyncPanel: mocks.panels.starSync,
  AIConfigPanel: mocks.panels.ai,
  WebDAVPanel: mocks.panels.webdav,
  BackupPanel: mocks.panels.backup,
  BackendPanel: mocks.panels.backend,
  CategoryPanel: mocks.panels.category,
  MenuManagementPanel: mocks.panels.menu,
  DataManagementPanel: mocks.panels.data,
  DiagnosticLogsPanel: mocks.panels.logs,
  NetworkPanel: mocks.panels.network,
  VectorSearchSettings: mocks.panels.vectorSearch,
  McpSettingsPanel: mocks.panels.mcp,
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

async function selectTab(label: string, panelName: string) {
  fireEvent.click(screen.getAllByRole('tab', { name: label })[0]);
  await waitFor(() => expect(screen.getByTestId(`settings-panel-${panelName}`)).toBeInTheDocument());
  await act(async () => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 130));
  });
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    mocks.backend.isAvailable = true;
    mocks.storeState.setCurrentView.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders every available settings tab and switches to its panel', { timeout: 15000 }, async () => {
    render(<SettingsPanel />);

    expect(screen.getByTestId('settings-panel-general')).toBeInTheDocument();
    const tabs = [
      ['Star Sync', 'star-sync'],
      ['AI Config', 'ai'],
      ['WebDAV', 'webdav'],
      ['Backup', 'backup'],
      ['Backend', 'backend'],
      ['Categories', 'category'],
      ['Menu', 'menu'],
      ['Data Management', 'data'],
      ['Diagnostic Logs', 'logs'],
      ['Network', 'network'],
      ['Vector Search', 'vector-search'],
      ['MCP Server', 'mcp'],
    ];

    for (const [label, panelName] of tabs) {
      await selectTab(label, panelName);
    }
  });

  it('hides long-lived backend tabs when neither a backend nor Electron is available', () => {
    mocks.backend.isAvailable = false;

    render(<SettingsPanel />);

    expect(screen.queryByRole('tab', { name: 'Network' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'MCP Server' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: 'Backend' })).toHaveLength(2);
  });

  it('opens a tab requested through the pending session navigation handoff', async () => {
    sessionStorage.setItem('gsm:pending-settings-tab', 'backend');

    render(<SettingsPanel />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('settings-panel-backend')).toBeInTheDocument();
    expect(sessionStorage.getItem('gsm:pending-settings-tab')).toBeNull();
  });
});
