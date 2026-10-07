import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './LoginScreen';
import { TooltipProvider } from './ui/tooltip';

const storeState = {
  setUser: vi.fn(),
  setGitHubToken: vi.fn(),
  repositories: [],
  lastSync: null,
  language: 'en' as const,
  setLanguage: vi.fn(),
  theme: 'light' as const,
  setTheme: vi.fn(),
};

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));
vi.mock('../features/lifecycle/hooks/useLoginActions', () => ({
  useLoginActions: () => ({
    authenticateWithGitHub: vi.fn(),
    fetchManagedSession: vi.fn(),
    workerManaged: false,
  }),
}));
vi.mock('../utils/clipboardUtils', () => ({ safeReadText: vi.fn() }));

describe('LoginScreen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows token permission guidance for both token types', () => {
    render(<TooltipProvider><LoginScreen /></TooltipProvider>);

    expect(screen.getByText('Classic token:')).toBeInTheDocument();
    expect(screen.getByText(/Enable the user scope/)).toBeInTheDocument();
    expect(screen.getByText('Fine-grained token:')).toBeInTheDocument();
    expect(screen.getByText(/Starring \(read and write\)/)).toBeInTheDocument();
    expect(screen.getByText(/Click Generate new token \(classic\) or Fine-grained token/)).toBeInTheDocument();
  });
});
