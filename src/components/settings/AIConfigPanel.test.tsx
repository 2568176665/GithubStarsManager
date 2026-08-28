import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIConfigPanel } from './AIConfigPanel';
import { AIConfig } from '../../types';

const mocks = vi.hoisted(() => {
  const storeState = {
    aiConfigs: [] as AIConfig[],
    activeAIConfig: null as string | null,
    language: 'en',
    translationEngine: 'microsoft' as const,
    repositoryChatSettings: {
      enabled: true,
      chatConfigId: null as string | null,
      streamingMode: 'auto' as const,
      enableWebTools: false,
      retainSessionDays: 90,
      maxToolsPerTurn: 20,
      agentBudget: { maxTurns: 4, maxToolCalls: 20, maxReadFiles: 8, maxCodeReads: 3, maxNoProgressRounds: 2, maxDurationMs: 90000 },
    },
    setTranslationEngine: vi.fn(),
    setRepositoryChatSettings: vi.fn(),
    addAIConfig: vi.fn(),
    updateAIConfig: vi.fn(),
    deleteAIConfig: vi.fn(),
    setActiveAIConfig: vi.fn(),
    setCurrentView: vi.fn(),
  };

  return {
    storeState,
    useAppStore: vi.fn((selector?: (state: typeof storeState) => unknown) => selector ? selector(storeState) : storeState),
    testConfig: vi.fn(),
    testDraft: vi.fn(),
    toast: vi.fn(),
    confirm: vi.fn(),
  };
});

vi.mock('../../store/useAppStore', () => ({ useAppStore: mocks.useAppStore }));
vi.mock('../../features/settings/hooks/useAIConfigActions', () => ({
  useAIConfigActions: () => ({
    testingId: null,
    testingForm: false,
    testConfig: mocks.testConfig,
    testDraft: mocks.testDraft,
  }),
}));
vi.mock('../../hooks/useDialog', () => ({
  useDialog: () => ({ toast: mocks.toast, confirm: mocks.confirm }),
}));

const t = (_zh: string, en: string) => en;

const createConfig = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: 'config-1',
  name: 'Primary AI',
  apiType: 'openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'secret-key',
  model: 'example-model',
  isActive: true,
  concurrency: 2,
  ...overrides,
});

describe('AIConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storeState.aiConfigs = [];
    mocks.storeState.activeAIConfig = null;
    mocks.storeState.repositoryChatSettings = {
      enabled: true,
      chatConfigId: null,
      streamingMode: 'auto',
      enableWebTools: false,
      retainSessionDays: 90,
      maxToolsPerTurn: 20,
      agentBudget: { maxTurns: 4, maxToolCalls: 20, maxReadFiles: 8, maxCodeReads: 3, maxNoProgressRounds: 2, maxDurationMs: 90000 },
    };
    mocks.confirm.mockResolvedValue(true);
    mocks.testConfig.mockResolvedValue(undefined);
    mocks.testDraft.mockResolvedValue(undefined);
  });

  it('validates required fields before saving a new AI configuration', () => {
    render(<AIConfigPanel t={t} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Config' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.storeState.addAIConfig).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith('Please fill in all required fields', 'error');
  });

  it('adds a configuration, normalizes the endpoint, and activates the first one', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    render(<AIConfigPanel t={t} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Config' }));
    fireEvent.change(screen.getByLabelText(/Configuration Name/), { target: { value: 'OpenAI Local' } });
    fireEvent.change(screen.getByLabelText(/API Endpoint/), { target: { value: 'https://api.example.com/v1/' } });
    fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: 'key-123' } });
    fireEvent.change(screen.getByLabelText(/Model Name/), { target: { value: 'gpt-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.storeState.addAIConfig).toHaveBeenCalledWith(expect.objectContaining({
      id: '1700000000000',
      name: 'OpenAI Local',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'key-123',
      model: 'gpt-test',
      isActive: false,
    }));
    expect(mocks.storeState.setActiveAIConfig).toHaveBeenCalledWith('1700000000000');
    vi.restoreAllMocks();
  });

  it('edits an existing configuration and preserves its active state', () => {
    const config = createConfig();
    mocks.storeState.aiConfigs = [config];
    mocks.storeState.activeAIConfig = config.id;
    render(<AIConfigPanel t={t} />);

    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.change(screen.getByLabelText(/Model Name/), { target: { value: 'updated-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.storeState.updateAIConfig).toHaveBeenCalledWith(config.id, expect.objectContaining({
      model: 'updated-model',
      isActive: true,
    }));
    expect(mocks.storeState.addAIConfig).not.toHaveBeenCalled();
  });

  it('tests, activates, and deletes an existing configuration from its card', async () => {
    const config = createConfig();
    mocks.storeState.aiConfigs = [config, createConfig({ id: 'config-2', name: 'Backup AI', isActive: false })];
    mocks.storeState.activeAIConfig = config.id;
    mocks.storeState.repositoryChatSettings = { ...mocks.storeState.repositoryChatSettings, chatConfigId: config.id };
    render(<AIConfigPanel t={t} />);

    fireEvent.click(screen.getAllByTitle('Test Connection')[0]);
    expect(mocks.testConfig).toHaveBeenCalledWith(config);

    fireEvent.click(screen.getByRole('radio', { name: 'Backup AI' }));
    expect(mocks.storeState.setActiveAIConfig).toHaveBeenCalledWith('config-2');

    fireEvent.click(screen.getAllByTitle('Delete')[0]);
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(
      'Delete AI Configuration?',
      'This action cannot be undone.',
      { type: 'danger', confirmText: 'Delete' },
    ));
    expect(mocks.storeState.setRepositoryChatSettings).toHaveBeenCalledWith({ chatConfigId: null });
    expect(mocks.storeState.deleteAIConfig).toHaveBeenCalledWith(config.id);
  });

  it('tests the draft form after the endpoint, key, and model are supplied', async () => {
    render(<AIConfigPanel t={t} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Config' }));
    fireEvent.change(screen.getByLabelText(/Configuration Name/), { target: { value: 'Draft Config' } });
    fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: 'draft-key' } });
    fireEvent.change(screen.getByLabelText(/Model Name/), { target: { value: 'draft-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));

    await waitFor(() => expect(mocks.testDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: '',
      name: 'Draft Config',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'draft-key',
      model: 'draft-model',
      isActive: false,
    })));
  });

  it('auto-fills the default prompt when custom prompting is enabled', () => {
    render(<AIConfigPanel t={t} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Config' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use Custom Prompt' }));

    expect((screen.getByRole('textbox', { name: /Custom Prompt/ }) as HTMLTextAreaElement).value).toContain('Please analyze');
  });
});
