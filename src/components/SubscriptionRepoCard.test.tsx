import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionRepoCard } from './SubscriptionRepoCard';
import type { DiscoveryRepo } from '../types';

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    language: 'zh',
    githubToken: null,
    aiConfigs: [],
    activeAIConfig: null,
    customCategories: [],
    updateDiscoveryRepo: vi.fn(),
    repositories: [],
    addRepository: vi.fn(),
    deleteRepository: vi.fn(),
  }),
  getAllCategories: vi.fn(() => []),
}));

vi.mock('../hooks/useDialog', () => ({
  useDialog: () => ({ toast: vi.fn() }),
}));

vi.mock('./ReadmeModal', () => ({
  ReadmeModal: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="readme-modal" /> : null
  ),
}));

vi.mock('./Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => (
    isOpen ? <div>{children}</div> : null
  ),
}));

const repo: DiscoveryRepo = {
  id: 1,
  full_name: 'owner/example',
  html_url: 'https://github.com/owner/example',
  owner: { login: 'owner', avatar_url: 'https://github.com/owner.png' },
  name: 'example',
  rank: 1,
  description: 'Example repository',
  language: 'TypeScript',
  stargazers_count: 100,
  forks_count: 10,
  forks: 10,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  pushed_at: '2024-01-01T00:00:00Z',
  topics: [],
  channel: 'trending',
  platform: 'All',
};

describe('SubscriptionRepoCard', () => {
  const renderCard = () => render(<SubscriptionRepoCard repo={repo} />);

  it('opens GitHub without opening the README modal', () => {
    renderCard();

    const githubLink = screen.getByTitle('在GitHub打开');
    expect(githubLink).toHaveAttribute('href', repo.html_url);
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');

    fireEvent.click(githubLink);

    expect(screen.queryByTestId('readme-modal')).not.toBeInTheDocument();
  });

  it('opens the README modal when the card itself is clicked', () => {
    renderCard();

    fireEvent.click(screen.getByText(repo.full_name));

    expect(screen.getByTestId('readme-modal')).toBeInTheDocument();
  });

  it('does not show a hover tooltip for the trending repository description', () => {
    renderCard();

    fireEvent.mouseEnter(screen.getByText('Example repository'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
