import { describe, expect, it } from 'vitest';
import type { Repository } from '../types';
import {
  getRepositoryColumnCount,
  groupRepositoriesIntoRows,
  shouldLoadMoreRepositories,
} from './virtualizedRepositoryRowsUtils';

const repositories = Array.from({ length: 5 }, (_, index) => ({
  id: index + 1,
} as Repository));

describe('VirtualizedRepositoryRows helpers', () => {
  it('uses one column for list mode and responsive grid breakpoints', () => {
    expect(getRepositoryColumnCount('list', 1440)).toBe(1);
    expect(getRepositoryColumnCount('grid', 640)).toBe(1);
    expect(getRepositoryColumnCount('grid', 768)).toBe(2);
    expect(getRepositoryColumnCount('grid', 1024)).toBe(3);
  });

  it('groups repositories by row so each virtual item is a complete row', () => {
    expect(groupRepositoriesIntoRows(repositories, 1).map((row) => row.map((repo) => repo.id)))
      .toEqual([[1], [2], [3], [4], [5]]);
    expect(groupRepositoriesIntoRows(repositories, 2).map((row) => row.map((repo) => repo.id)))
      .toEqual([[1, 2], [3, 4], [5]]);
    expect(groupRepositoriesIntoRows(repositories, 3).map((row) => row.map((repo) => repo.id)))
      .toEqual([[1, 2, 3], [4, 5]]);
  });

  it('loads the next batch when the virtualized range reaches the last two rows', () => {
    expect(shouldLoadMoreRepositories(true, 7, 10)).toBe(false);
    expect(shouldLoadMoreRepositories(true, 8, 10)).toBe(true);
    expect(shouldLoadMoreRepositories(false, 9, 10)).toBe(false);
  });
});
