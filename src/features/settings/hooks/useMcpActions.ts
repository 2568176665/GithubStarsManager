import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../../store/useAppStore';
import { useDialog } from '../../../hooks/useDialog';
import { backend } from '../../../services/backendAdapter';

interface UseMcpActionsOptions {
  t: (zh: string, en: string) => string;
}

export interface McpActions {
  loading: boolean;
  saving: boolean;
  error: string | null;
  backendMode: boolean;
  vectorAvailable: boolean | null;
  endpoints: { streamableHttp: string; sse: string; messages: string };
  clearError: () => void;
  refresh: () => Promise<void>;
  toggle: (enabled: boolean) => Promise<void>;
  resetToken: () => Promise<void>;
}

/** Keeps MCP backend operations and token lifecycle away from the form view. */
export const useMcpActions = ({ t }: UseMcpActionsOptions): McpActions => {
  const { mcpConfig, setMcpConfig } = useAppStore(useShallow((state) => ({
    mcpConfig: state.mcpConfig,
    setMcpConfig: state.setMcpConfig,
  })));
  const { toast, confirm } = useDialog();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendMode, setBackendMode] = useState(false);
  const [vectorAvailable, setVectorAvailable] = useState<boolean | null>(null);
  const [endpoints, setEndpoints] = useState({ streamableHttp: '/mcp', sse: '/sse', messages: '/messages' });

  const refreshFromBackend = useCallback(async () => {
    if (!backend.isAvailable || backend.isWorkerEnvMode) {
      setBackendMode(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = await backend.getMcpStatus();
      setBackendMode(true);
      setMcpConfig({ enabled: status.enabled, token: status.token });
      setEndpoints(status.endpoints);
      setVectorAvailable(status.vectorAvailable);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [setMcpConfig]);

  useEffect(() => { void refreshFromBackend(); }, [refreshFromBackend]);

  const toggle = useCallback(async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      if (backendMode && backend.isAvailable) {
        const result = await backend.updateMcpConfig({ enabled });
        setMcpConfig({ enabled: result.enabled, token: result.token });
        setEndpoints(result.endpoints);
        toast(enabled ? t('MCP 服务已开启', 'MCP server enabled') : t('MCP 服务已关闭', 'MCP server disabled'), 'success');
      } else {
        toast(t('需要后端连接才能使用 MCP', 'Backend connection required for MCP'), 'error');
      }
    } catch (reason) {
      setError((reason as Error).message);
      toast(t('操作失败', 'Operation failed'), 'error');
    } finally {
      setSaving(false);
    }
  }, [backendMode, setMcpConfig, t, toast]);

  const resetToken = useCallback(async () => {
    if (!mcpConfig.enabled) {
      toast(t('请先开启 MCP 服务再重置 Token', 'Enable MCP before resetting the token'), 'error');
      return;
    }
    const confirmed = await confirm(
      t('重置 MCP Token', 'Reset MCP Token'),
      t('重置后旧 Token 立即失效，需要更新 Agent 配置。是否继续？', 'The old token will stop working immediately. Update your agent config. Continue?'),
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      if (backendMode && backend.isAvailable) {
        const result = await backend.updateMcpConfig({ resetToken: true, enabled: true });
        setMcpConfig({ token: result.token, enabled: result.enabled });
      }
      toast(t('Token 已重置', 'Token reset'), 'success');
    } catch (reason) {
      setError((reason as Error).message);
      toast(t('重置失败', 'Reset failed'), 'error');
    } finally {
      setSaving(false);
    }
  }, [backendMode, confirm, mcpConfig.enabled, setMcpConfig, t, toast]);

  return {
    loading,
    saving,
    error,
    backendMode,
    vectorAvailable,
    endpoints,
    clearError: () => setError(null),
    refresh: refreshFromBackend,
    toggle,
    resetToken,
  };
};
