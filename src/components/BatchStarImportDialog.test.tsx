import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from '../types';

const mocks = vi.hoisted(() => ({
  store: {
    language: 'en' as 'en' | 'zh',
    githubToken: 'token' as string | null,
    user: { id: 1, login: 'alice', name: 'Alice', avatar_url: '', email: null } as null | { id: number; login: string; name: string; avatar_url: string; email: string | null },
  },
  rows: [] as Array<{ fullName: string; source: 'text'; status: 'ready'; repository?: Repository; isStarred: boolean | null; selected: boolean }>,
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
}));

vi.mock('../features/repositories/hooks/useBatchStarImport', () => ({
  BATCH_STAR_IMPORT_LIMIT: 50,
  useBatchStarImport: () => ({
    rows: mocks.rows,
    duplicates: [],
    invalid: [],
    isResolving: false,
    isStarring: false,
    starProgress: { done: 0, total: 0 },
    translationError: null,
    syncError: null,
    resolveInput: vi.fn(),
    toggleSelected: vi.fn(),
    selectAllReady: vi.fn(),
    starSelected: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('./ReadmeModal', () => ({
  ReadmeModal: ({ isOpen, repository }: { isOpen: boolean; repository: Repository | null }) =>
    <div data-testid="readme-preview">{isOpen ? repository?.full_name : ''}</div>,
}));

import { BatchStarImportDialog } from './BatchStarImportDialog';

const paste = (element: HTMLElement, text: string) => {
  fireEvent.paste(element, { clipboardData: { getData: () => text } });
};

describe('BatchStarImportDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.store.language = 'en';
    mocks.store.githubToken = 'token';
    mocks.store.user = { id: 1, login: 'alice', name: 'Alice', avatar_url: '', email: null };
    mocks.rows = [];
  });

  it('stores the last ten pasted inputs per GitHub account and lets the user edit a history entry', async () => {
    const user = userEvent.setup();
    const view = render(<BatchStarImportDialog open onClose={vi.fn()} />);
    const textarea = screen.getByRole('textbox', { name: 'Repository links or JSON' });

    for (let index = 0; index < 11; index += 1) paste(textarea, `owner/repo-${index}`);

    const aliceKey = 'github-stars-batch-star-inputs:alice';
    expect(JSON.parse(localStorage.getItem(aliceKey) || '[]')).toEqual(
      Array.from({ length: 10 }, (_, index) => `owner/repo-${10 - index}`),
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Recent pasted inputs' }), '3');
    expect(textarea).toHaveValue('owner/repo-7');

    mocks.store.user = { id: 2, login: 'bob', name: 'Bob', avatar_url: '', email: null };
    view.rerender(<BatchStarImportDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Recent pasted inputs' })).not.toBeInTheDocument());

    paste(screen.getByRole('textbox', { name: 'Repository links or JSON' }), 'other/project');
    expect(JSON.parse(localStorage.getItem('github-stars-batch-star-inputs:bob') || '[]')).toEqual(['other/project']);
    expect(JSON.parse(localStorage.getItem(aliceKey) || '[]')).toHaveLength(10);
  });

  it('opens the shared README preview for a resolved repository', async () => {
    const repository: Repository = {
      id: 1,
      name: 'repo',
      full_name: 'owner/repo',
      description: null,
      html_url: 'https://github.com/owner/repo',
      stargazers_count: 1,
      forks_count: 0,
      forks: 0,
      language: 'TypeScript',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      pushed_at: '2026-01-01T00:00:00.000Z',
      owner: { login: 'owner', avatar_url: '' },
      topics: [],
    };
    mocks.rows = [{ fullName: repository.full_name, source: 'text', status: 'ready', repository, isStarred: false, selected: true }];
    const user = userEvent.setup();
    render(<BatchStarImportDialog open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Preview README' }));

    expect(await screen.findByTestId('readme-preview')).toHaveTextContent('owner/repo');
  });
});
