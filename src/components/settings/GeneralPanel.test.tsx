import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslateFn } from '../../i18n/useT';
import { DialogProvider } from '../../hooks/useDialog';
import { GeneralPanel } from './GeneralPanel';

const storeState = {
  language: 'en' as const,
  setLanguage: vi.fn(),
};

vi.mock('../../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));
vi.mock('../UpdateChecker', () => ({ UpdateChecker: () => <button type="button">Update</button> }));
vi.mock('./ThemeSettingsCard', () => ({ ThemeSettingsCard: () => <div /> }));

const t: TranslateFn = (key) => key;

describe('GeneralPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes the GitHub token permission guide', async () => {
    render(
      <DialogProvider>
        <GeneralPanel t={t} />
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'generalPanel.token-permission-guide' }));

    expect(await screen.findByRole('tab', { name: 'Fine-grained' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Classic' })).toBeInTheDocument();
    expect(screen.getAllByText('Managing Stars')).toHaveLength(2);

    fireEvent.click(screen.getByRole('tab', { name: 'Classic' }));
    expect(screen.getByText('public_repo')).toBeInTheDocument();
  });
});
