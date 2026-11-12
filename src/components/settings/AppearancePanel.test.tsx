import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {};
  const useAppStore = (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(state) : state;
  return {
    state,
    useAppStore,
  };
});

vi.mock('../../store/useAppStore', () => ({ useAppStore: mocks.useAppStore }));
vi.mock('../UpdateChecker', () => ({ UpdateChecker: () => null }));
vi.mock('./ThemeSettingsCard', () => ({ ThemeSettingsCard: () => null }));
vi.mock('../../features/settings/hooks/useGitHubTokenActions', () => ({
  useGitHubTokenActions: () => ({
    tokenInput: '',
    isSaving: false,
    setTokenInput: vi.fn(),
    updateToken: vi.fn(),
  }),
}));

import { makeT } from '../../i18n/useT';
import { AppearancePanel } from './AppearancePanel';
import { GeneralPanel } from './GeneralPanel';

const t = makeT('zh', 'app');

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.state, { language: 'zh', setLanguage: vi.fn(), user: null });
});

describe('AppearancePanel language settings', () => {
  it('renders the language grid inside Appearance (not General)', () => {
    const { container } = render(<AppearancePanel t={t} />);
    expect(screen.getByRole('radiogroup', { name: t('generalPanel.language-settings') })).toBeTruthy();
    const languageGrid = container.querySelector('[aria-labelledby="language-settings-title"]');
    expect(languageGrid?.className ?? '').toContain('w-full');
    expect(languageGrid?.className ?? '').toContain('grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]');
    expect(languageGrid?.className ?? '').not.toContain('max-w-lg');
  });

  it('no longer renders language settings inside General', () => {
    render(<GeneralPanel t={t} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

describe('GeneralPanel desktop section', () => {
  it('does not show desktop options in the web client', () => {
    render(<GeneralPanel t={t} />);
    expect(screen.queryByText('桌面选项')).toBeNull();
    expect(screen.queryByLabelText('开机自动启动')).toBeNull();
    expect(screen.queryByLabelText('关闭时最小化到托盘')).toBeNull();
    expect(screen.queryByLabelText('最小化时隐藏到托盘')).toBeNull();
  });
});
