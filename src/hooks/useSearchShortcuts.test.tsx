import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearchShortcuts } from './useSearchShortcuts';

describe('useSearchShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces the listener when callbacks change and cleans it up on unmount', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const firstFocus = vi.fn();
    const secondFocus = vi.fn();
    const onClearSearch = vi.fn();
    const onToggleFilters = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onFocusSearch }) => useSearchShortcuts({
        onFocusSearch,
        onClearSearch,
        onToggleFilters,
      }),
      { initialProps: { onFocusSearch: firstFocus } },
    );

    const initialListener = addEventListener.mock.calls.find(([type]) => type === 'keydown')?.[1];
    expect(initialListener).toBeDefined();
    rerender({ onFocusSearch: secondFocus });
    const added = addEventListener.mock.calls.filter(([type]) => type === 'keydown');
    const removed = removeEventListener.mock.calls.filter(([type]) => type === 'keydown');
    expect(added).toHaveLength(2);
    expect(removed).toHaveLength(1);
    expect(removed[0][1]).toBe(initialListener);
    expect(added[1][1]).not.toBe(initialListener);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(firstFocus).not.toHaveBeenCalled();
    expect(secondFocus).toHaveBeenCalledOnce();

    unmount();
    const allRemoved = removeEventListener.mock.calls.filter(([type]) => type === 'keydown');
    expect(allRemoved).toHaveLength(2);
    expect(allRemoved[1][1]).toBe(added[1][1]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(secondFocus).toHaveBeenCalledOnce();
  });
});
