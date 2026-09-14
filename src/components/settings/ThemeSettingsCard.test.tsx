import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The global test setup mocks the app store module, so this suite installs its
 * own controllable double that mimics the tiny slice of store behavior the
 * card needs (theme plus its setter). Real store logic is
 * covered in useAppStore.test.ts.
 */
const mocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {};
  const setState = (partial: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>)) => {
    Object.assign(state, typeof partial === 'function' ? partial(state) : partial);
  };
  const useAppStore = Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => (selector ? selector(state) : state),
    { getState: () => state, setState },
  );
  return { state, useAppStore };
});

vi.mock('../../store/useAppStore', () => ({ useAppStore: mocks.useAppStore }));

import { ThemeSettingsCard } from './ThemeSettingsCard';

const t = (zh: string) => zh;

beforeEach(() => {
  Object.assign(mocks.state, {
    theme: 'dark',
    setTheme: vi.fn((mode: 'light' | 'dark') => {
      mocks.state.theme = mode;
    }),
  });
});

describe('ThemeSettingsCard', () => {
  it('renders display mode options', () => {
    render(<ThemeSettingsCard t={t} />);
    expect(screen.getByText('显示模式')).toBeTruthy();
    expect(screen.getByText('浅色')).toBeTruthy();
    expect(screen.getByText('深色')).toBeTruthy();
  });

  it('does not render theme color presets', () => {
    render(<ThemeSettingsCard t={t} />);
    expect(screen.queryByRole('radiogroup', { name: '主题配色' })).toBeNull();
    expect(screen.queryByText('主题配色')).toBeNull();
  });

  it('switches display mode through the mode radio group', async () => {
    const user = userEvent.setup();
    render(<ThemeSettingsCard t={t} />);
    await user.click(screen.getByText('浅色'));
    expect(mocks.state.setTheme).toHaveBeenCalledWith('light');
    expect(mocks.state.theme).toBe('light');
  });
});
