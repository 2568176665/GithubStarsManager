import type { Repository } from '../types';

export function getRepositoryColumnCount(
  viewMode: 'grid' | 'list',
  viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth,
): number {
  if (viewMode === 'list') return 1;
  if (viewportWidth >= 1024) return 3;
  if (viewportWidth >= 768) return 2;
  return 1;
}

export function groupRepositoriesIntoRows(
  repositories: Repository[],
  columnCount: number,
): Repository[][] {
  if (columnCount === 1) return repositories.map((repository) => [repository]);

  const grouped: Repository[][] = [];
  for (let index = 0; index < repositories.length; index += columnCount) {
    grouped.push(repositories.slice(index, index + columnCount));
  }
  return grouped;
}

export function shouldLoadMoreRepositories(
  hasMore: boolean,
  lastVirtualIndex: number,
  rowCount: number,
): boolean {
  return hasMore && lastVirtualIndex >= rowCount - 2;
}
