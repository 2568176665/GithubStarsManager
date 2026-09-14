import { useCallback, useEffect, useState } from 'react';
import { syncFromBackend, syncToBackend } from '../../../services/autoSync';
import { backend } from '../../../services/backendAdapter';

export const useBackendSettingsActions = () => {
  const [checking, setChecking] = useState(true);
  const [health, setHealth] = useState<{ version?: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    await backend.init();
    setHealth(await backend.checkHealth());
    setChecking(false);
  }, []);

  useEffect(() => { void check(); }, [check]);

  const sync = useCallback(async (direction: 'up' | 'down') => {
    setSyncing(true);
    try {
      if (direction === 'up') await syncToBackend();
      else await syncFromBackend();
    } finally {
      setSyncing(false);
    }
  }, []);

  return { checking, health, syncing, check, sync };
};
