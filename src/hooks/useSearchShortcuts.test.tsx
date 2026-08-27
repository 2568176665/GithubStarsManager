import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearchShortcuts } from './useSearchShortcuts';

describe('useSearchShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers one listener and invokes the latest callbacks', () => {
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

    rerender({ onFocusSearch: secondFocus });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));

    expect(addEventListener.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    expect(firstFocus).not.toHaveBeenCalled();
    expect(secondFocus).toHaveBeenCalledOnce();

    unmount();
    expect(removeEventListener.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
  });
});
