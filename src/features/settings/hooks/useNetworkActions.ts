import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { backend } from '../../../services/backendAdapter';
import { testRpcDownload } from '../../../services/rpcDownloadService';
import type { RpcDownloadConfig } from '../../../types';

interface UseNetworkActionsOptions {
  t: (zh: string, en: string) => string;
}

type RpcConnectionResult = { success: boolean; error?: string; version?: string };

export interface NetworkActions {
  rpcForm: RpcDownloadConfig;
  rpcTesting: boolean;
  rpcSaving: boolean;
  isRpcToggling: boolean;
  rpcTestResult: RpcConnectionResult | null;
  hasStoredSecret: boolean;
  isRpcFormValid: boolean;
  hasRpcChanges: boolean;
  setRpcForm: (config: RpcDownloadConfig) => void;
  clearStoredSecret: () => void;
  saveRpc: () => Promise<void>;
  testRpc: () => Promise<void>;
  toggleRpc: (enabled: boolean) => Promise<void>;
}

export const useNetworkActions = ({ t }: UseNetworkActionsOptions): NetworkActions => {
  const { rpcDownloadConfig, setRpcDownloadConfig } = useAppStore((state) => ({
    rpcDownloadConfig: state.rpcDownloadConfig,
    setRpcDownloadConfig: state.setRpcDownloadConfig,
  }));
  const [rpcForm, setRpcForm] = useState(rpcDownloadConfig);
  const [rpcTesting, setRpcTesting] = useState(false);
  const [rpcSaving, setRpcSaving] = useState(false);
  const [isRpcToggling, setIsRpcToggling] = useState(false);
  const [rpcTestResult, setRpcTestResult] = useState<RpcConnectionResult | null>(null);
  const [hasStoredSecret, setHasStoredSecret] = useState(() => Boolean(rpcDownloadConfig.secret));

  useEffect(() => {
    setRpcForm((current) => ({ ...current, enabled: rpcDownloadConfig.enabled }));
  }, [rpcDownloadConfig.enabled]);

  useEffect(() => {
    const loadRpcConfig = async () => {
      try {
        if (!backend.isAvailable) await backend.init();
        if (!backend.backendUrl) return;
        const response = await fetch(`${backend.backendUrl}/settings/rpc-download`);
        if (!response.ok) return;
        const data = await response.json() as Partial<RpcDownloadConfig> & { hasSecret?: boolean };
        if (data.hasSecret) setHasStoredSecret(true);
        if (data.enabled === undefined && !data.host && !data.port) return;
        const current = useAppStore.getState().rpcDownloadConfig;
        const hydrated = { ...current, enabled: data.enabled ?? current.enabled, host: data.host || current.host, port: data.port || current.port };
        setRpcForm((form) => JSON.stringify(form) === JSON.stringify(current) ? hydrated : form);
        setRpcDownloadConfig(hydrated);
      } catch {
        // Worker RPC settings are optional and should not block the settings page.
      }
    };
    void loadRpcConfig();
  }, [setRpcDownloadConfig]);

  const isRpcFormValid = !rpcForm.enabled || Boolean(rpcForm.host.trim() && rpcForm.port >= 1 && rpcForm.port <= 65535);

  const saveRpc = useCallback(async () => {
    if (!isRpcFormValid) return;
    setRpcSaving(true);
    setRpcTestResult(null);
    try {
      if (backend.isAvailable && backend.backendUrl) {
        const body: Record<string, unknown> = { enabled: rpcForm.enabled, host: rpcForm.host, port: rpcForm.port };
        if (rpcForm.secret) body.secret = rpcForm.secret;
        const response = await fetch(`${backend.backendUrl}/settings/rpc-download`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`Worker returned ${response.status}`);
      }
      setRpcDownloadConfig(rpcForm);
      if (rpcForm.secret) setHasStoredSecret(true);
    } catch (reason) {
      setRpcTestResult({ success: false, error: reason instanceof Error ? reason.message : t('保存失败', 'Save failed') });
    } finally {
      setRpcSaving(false);
    }
  }, [isRpcFormValid, rpcForm, setRpcDownloadConfig, t]);

  const testRpc = useCallback(async () => {
    setRpcTesting(true);
    setRpcTestResult(null);
    setRpcTestResult(await testRpcDownload(rpcForm));
    setRpcTesting(false);
  }, [rpcForm]);

  const toggleRpc = useCallback(async (enabled: boolean) => {
    if (isRpcToggling) return;
    const previous = rpcForm;
    const next = { ...rpcDownloadConfig, enabled };
    setIsRpcToggling(true);
    setRpcForm((current) => ({ ...current, enabled }));
    try {
      await saveRpcConfig(next);
      setRpcDownloadConfig(next);
    } catch (reason) {
      setRpcForm(previous);
      setRpcTestResult({ success: false, error: reason instanceof Error ? reason.message : t('保存失败', 'Save failed') });
    } finally {
      setIsRpcToggling(false);
    }
  }, [isRpcToggling, rpcDownloadConfig, rpcForm, setRpcDownloadConfig, t]);

  const saveRpcConfig = async (config: RpcDownloadConfig) => {
    if (!backend.isAvailable || !backend.backendUrl) return;
    const body: Record<string, unknown> = { enabled: config.enabled, host: config.host, port: config.port };
    if (config.secret) body.secret = config.secret;
    const response = await fetch(`${backend.backendUrl}/settings/rpc-download`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Worker returned ${response.status}`);
  };

  return {
    rpcForm,
    rpcTesting,
    rpcSaving,
    isRpcToggling,
    rpcTestResult,
    hasStoredSecret,
    isRpcFormValid,
    hasRpcChanges: JSON.stringify(rpcForm) !== JSON.stringify(rpcDownloadConfig),
    setRpcForm,
    clearStoredSecret: () => setHasStoredSecret(false),
    saveRpc,
    testRpc,
    toggleRpc,
  };
};
