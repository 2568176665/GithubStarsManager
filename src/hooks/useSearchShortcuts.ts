import { useEffect, useRef } from 'react';

interface UseSearchShortcutsProps {
  onFocusSearch: () => void;
  onClearSearch: () => void;
  onToggleFilters: () => void;
}

/**
 * 搜索快捷键Hook
 * 提供键盘快捷键支持，提升搜索体验
 */
export const useSearchShortcuts = ({
  onFocusSearch,
  onClearSearch,
  onToggleFilters
}: UseSearchShortcutsProps) => {
  const isListening = useRef(true);
  const callbacksRef = useRef({ onFocusSearch, onClearSearch, onToggleFilters });

  callbacksRef.current = { onFocusSearch, onClearSearch, onToggleFilters };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isListening.current) return;

      // 检查是否在输入框中
      const isInInput = event.target instanceof HTMLInputElement || 
                       event.target instanceof HTMLTextAreaElement ||
                       (event.target as HTMLElement)?.contentEditable === 'true';

      // Ctrl/Cmd + K: 聚焦搜索框
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        callbacksRef.current.onFocusSearch();
        return;
      }

      // Escape: 清除搜索（仅在搜索框中时）
      if (event.key === 'Escape' && isInInput) {
        callbacksRef.current.onClearSearch();
        return;
      }

      // Ctrl/Cmd + Shift + F: 切换过滤器
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'F') {
        event.preventDefault();
        callbacksRef.current.onToggleFilters();
        return;
      }

      // / 键: 快速聚焦搜索框（仅在非输入状态下）
      if (event.key === '/' && !isInInput) {
        event.preventDefault();
        callbacksRef.current.onFocusSearch();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
    // Callbacks are read via callbacksRef so the listener remains registered once.
  }, []);

  // 提供暂停/恢复监听的方法
  const pauseListening = () => {
    isListening.current = false;
  };

  const resumeListening = () => {
    isListening.current = true;
  };

  return {
    pauseListening,
    resumeListening
  };
};

/**
 * 搜索快捷键提示组件数据
 */
export const searchShortcuts = [
  {
    key: 'Ctrl/Cmd + K',
    description: '聚焦搜索框',
    descriptionEn: 'Focus search box'
  },
  {
    key: 'Escape',
    description: '清除搜索',
    descriptionEn: 'Clear search'
  },
  {
    key: 'Ctrl/Cmd + Shift + F',
    description: '切换过滤器',
    descriptionEn: 'Toggle filters'
  },
  {
    key: '/',
    description: '快速搜索',
    descriptionEn: 'Quick search'
  },
  {
    key: 'Enter',
    description: 'AI搜索',
    descriptionEn: 'AI search'
  }
];
