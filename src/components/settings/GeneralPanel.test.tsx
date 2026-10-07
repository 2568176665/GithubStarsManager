import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const t = (_zh: string, en: string) => en;

describe('GeneralPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('explains classic and fine-grained token permissions', () => {
    render(<GeneralPanel t={t} />);

    expect(screen.getByText('Classic token:')).toBeInTheDocument();
    expect(screen.getByText(/Enable the user scope/)).toBeInTheDocument();
    expect(screen.getByText('Fine-grained token:')).toBeInTheDocument();
    expect(screen.getByText(/Starring \(read and write\)/)).toBeInTheDocument();
  });
});
