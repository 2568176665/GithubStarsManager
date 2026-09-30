import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from '../../../types';

const mocks = vi.hoisted(() => ({
  getRepositoryForImport: vi.fn(),
  isRepositoryStarred: vi.fn(),
  starRepository: vi.fn(),
  createGitHubApiService: vi.fn(),
  translateBatch: vi.fn(),
}));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: (selector: (state: { githubToken: string; language: 'en' }) => unknown) => selector({ githubToken: 'token', language: 'en' }),
}));
vi.mock('../../../services/githubApiFactory', () => ({
  createGitHubApiService: mocks.createGitHubApiService,
}));
vi.mock('../../../services/translateService', () => ({
  translateBatch: mocks.translateBatch,
}));

import { useBatchStarImport } from './useBatchStarImport';

const makeRepository = (fullName: string): Repository => {
  const [owner, name] = fullName.split('/');
  return {
    id: 1,
    name,
    full_name: fullName,
    description: `Description for ${fullName}`,
    html_url: `https://github.com/${fullName}`,
    stargazers_count: 10,
    forks_count: 1,
    forks: 1,
    language: 'TypeScript',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    pushed_at: '2026-01-01T00:00:00.000Z',
    owner: { login: owner, avatar_url: `https://github.com/${owner}.png` },
    topics: [],
  };
};

describe('useBatchStarImport', () => {
  const api = {
    getRepositoryForImport: mocks.getRepositoryForImport,
    isRepositoryStarred: mocks.isRepositoryStarred,
    starRepository: mocks.starRepository,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGitHubApiService.mockReturnValue(api);
    mocks.getRepositoryForImport.mockImplementation(async (owner: string, name: string) => makeRepository(`${owner}/${name}`));
    mocks.isRepositoryStarred.mockResolvedValue(false);
    mocks.starRepository.mockResolvedValue(undefined);
    mocks.translateBatch.mockImplementation(async (texts: string[]) => texts.map(text => ({ translatedText: `translated: ${text}` })));
  });

  it('caps resolution at 50 candidates and reports overflow', async () => {
    const { result } = renderHook(() => useBatchStarImport());
    const input = Array.from({ length: 51 }, (_, index) => `owner/repo-${index}`).join('\n');

    await act(async () => result.current.resolveInput(input, false));

    expect(result.current.rows).toHaveLength(50);
    expect(mocks.getRepositoryForImport).toHaveBeenCalledTimes(50);
    expect(result.current.invalid).toEqual([{ value: 'owner/repo-50', reason: '超过每批 50 个仓库的上限' }]);
  });

  it('selects only unstarred rows by default and translates descriptions on request', async () => {
    mocks.isRepositoryStarred.mockImplementation(async (_owner: string, name: string) => name === 'already');
    const { result } = renderHook(() => useBatchStarImport());

    await act(async () => result.current.resolveInput('owner/already\nowner/new', true));

    expect(result.current.rows.map(row => [row.status, row.selected])).toEqual([
      ['starred', false],
      ['ready', true],
    ]);
    expect(result.current.rows[1].translatedDescription).toBe('translated: Description for owner/new');
    expect(mocks.translateBatch).toHaveBeenCalledOnce();
  });

  it('records individual Star failures and still syncs successful additions', async () => {
    const onSynced = vi.fn(async () => undefined);
    mocks.starRepository.mockImplementation(async (_owner: string, name: string) => {
      if (name === 'broken') throw new Error('GitHub unavailable');
    });
    const { result } = renderHook(() => useBatchStarImport(onSynced));

    await act(async () => result.current.resolveInput('owner/good\nowner/broken', false));
    let starResult: { succeeded: number; failed: number } | undefined;
    await act(async () => { starResult = await result.current.starSelected(); });

    await waitFor(() => expect(onSynced).toHaveBeenCalledOnce());
    expect(starResult).toEqual({ succeeded: 1, failed: 1 });
    expect(result.current.rows.map(row => row.status)).toEqual(['success', 'star-error']);
    expect(result.current.rows[1].error).toBe('GitHub unavailable');
  });
});
