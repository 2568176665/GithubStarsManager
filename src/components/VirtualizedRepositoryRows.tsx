import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Repository } from '../types';
import {
  getRepositoryColumnCount,
  groupRepositoriesIntoRows,
  shouldLoadMoreRepositories,
} from './virtualizedRepositoryRowsUtils';

interface VirtualizedRepositoryRowsProps {
  repositories: Repository[];
  viewMode: 'grid' | 'list';
  hasMore: boolean;
  onReachEnd: () => void;
  renderRepository: (repository: Repository) => React.ReactNode;
}

const GRID_GAP_PX = 16;
const LIST_GAP_PX = 8;

export const VirtualizedRepositoryRows: React.FC<VirtualizedRepositoryRowsProps> = ({
  repositories,
  viewMode,
  hasMore,
  onReachEnd,
  renderRepository,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const onReachEndRef = useRef(onReachEnd);
  const [columnCount, setColumnCount] = useState(() => getRepositoryColumnCount(viewMode));
  const [scrollMargin, setScrollMargin] = useState(0);

  onReachEndRef.current = onReachEnd;

  useEffect(() => {
    const updateColumns = () => setColumnCount(getRepositoryColumnCount(viewMode));
    updateColumns();

    if (viewMode === 'list') return;
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [viewMode]);

  const rows = useMemo(() => {
    return groupRepositoriesIntoRows(repositories, columnCount);
  }, [columnCount, repositories]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => (viewMode === 'list' ? 180 : 260),
    getItemKey: (index) => rows[index]?.[0]?.id ?? index,
    overscan: 5,
    scrollMargin,
  });

  useLayoutEffect(() => {
    const updateScrollMargin = () => {
      const element = listRef.current;
      const nextMargin = element
        ? element.getBoundingClientRect().top + window.scrollY
        : 0;
      setScrollMargin((current) => current === nextMargin ? current : nextMargin);
    };

    updateScrollMargin();
    window.addEventListener('resize', updateScrollMargin);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateScrollMargin);
    if (resizeObserver && listRef.current) resizeObserver.observe(listRef.current);

    return () => {
      window.removeEventListener('resize', updateScrollMargin);
      resizeObserver?.disconnect();
    };
  }, [columnCount, viewMode]);

  useEffect(() => {
    virtualizer.measure();
  }, [columnCount, viewMode, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems.length > 0
    ? virtualItems[virtualItems.length - 1].index
    : -1;

  useEffect(() => {
    if (shouldLoadMoreRepositories(hasMore, lastVirtualIndex, rows.length)) {
      onReachEndRef.current();
    }
  }, [hasMore, lastVirtualIndex, rows.length]);

  return (
    <div ref={listRef} className="min-h-[200px]">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;

          const gap = viewMode === 'list' ? LIST_GAP_PX : GRID_GAP_PX;
          const isLastRow = virtualRow.index === rows.length - 1;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                paddingBottom: isLastRow ? 0 : `${gap}px`,
              }}
            >
              <div
                className={viewMode === 'list' ? 'space-y-2' : 'grid'}
                style={viewMode === 'grid'
                  ? {
                      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                      gap: `${GRID_GAP_PX}px`,
                    }
                  : undefined}
              >
                {row.map(renderRepository)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

VirtualizedRepositoryRows.displayName = 'VirtualizedRepositoryRows';
