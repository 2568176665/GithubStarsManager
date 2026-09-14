import React, { useCallback, useEffect, useState } from 'react';
import { logger } from '../services/logger';
import { useAppStore } from '../store/useAppStore';
import { Button } from './ui/button';

export const DebugModeIndicator: React.FC = () => {
  const [enabled, setEnabled] = useState(() => sessionStorage.getItem('gsm:frontend-debug') === 'true');
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  useEffect(() => {
    const check = () => setEnabled(sessionStorage.getItem('gsm:frontend-debug') === 'true');
    window.addEventListener('storage', check);
    const interval = setInterval(check, 2000);
    return () => {
      window.removeEventListener('storage', check);
      clearInterval(interval);
    };
  }, []);

  const handleClick = useCallback(() => {
    logger.setLevel('info');
    sessionStorage.setItem('gsm:frontend-debug', 'false');
    setEnabled(false);
    sessionStorage.setItem('gsm:pending-settings-tab', 'logs');
    setCurrentView('settings');
    window.dispatchEvent(new CustomEvent('gsm:navigate-to-settings-tab', { detail: { tab: 'logs' } }));
  }, [setCurrentView]);

  if (!enabled) return null;

  return (
    <Button type="button" variant="secondary" onClick={handleClick} className="fixed bottom-6 right-6 z-50 h-auto gap-2 rounded-full bg-success px-3 py-2 text-sm font-medium text-success-foreground shadow-lg hover:bg-success/90" title="Click to disable debug mode and open logs / 点击关闭调试并打开日志">
      <span className="h-2 w-2 animate-pulse rounded-full bg-success-foreground" />
      <span>DEBUG</span>
      <span className="text-xs opacity-80">FE</span>
    </Button>
  );
};
