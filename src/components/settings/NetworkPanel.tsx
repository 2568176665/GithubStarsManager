import React, { useState } from 'react';
import { CheckCircle2, Download, Eye, EyeOff, Loader2, XCircle } from 'lucide-react';
import { useNetworkActions } from '../../features/settings/hooks/useNetworkActions';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { NumberInput } from '../ui/NumberInput';
import { Switch } from '../ui/switch';

interface NetworkPanelProps {
  t: (zh: string, en: string) => string;
}

export const NetworkPanel: React.FC<NetworkPanelProps> = ({ t }) => {
  const {
    rpcForm,
    rpcTesting,
    rpcSaving,
    isRpcToggling,
    rpcTestResult,
    hasStoredSecret,
    isRpcFormValid,
    hasRpcChanges,
    setRpcForm,
    clearStoredSecret,
    saveRpc,
    testRpc,
    toggleRpc,
  } = useNetworkActions({ t });
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3"><Download className="h-5 w-5 text-muted-foreground" /><h4 className="font-medium text-foreground">{t('远程下载', 'Remote Download')}</h4></div>
          <Switch checked={rpcForm.enabled} onCheckedChange={(enabled) => void toggleRpc(enabled)} disabled={isRpcToggling} aria-label={t('启用远程下载', 'Enable remote download')} />
        </div>

        {rpcForm.enabled && <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label htmlFor="rpc-host" className="mb-1 block text-sm font-medium text-muted-foreground">{t('主机地址', 'Host')}</label><Input id="rpc-host" value={rpcForm.host} onChange={(event) => setRpcForm({ ...rpcForm, host: event.target.value })} placeholder="127.0.0.1" /></div>
            <div><label htmlFor="rpc-port" className="mb-1 block text-sm font-medium text-muted-foreground">{t('端口', 'Port')}</label><NumberInput id="rpc-port" value={rpcForm.port || undefined} onChange={(value) => setRpcForm({ ...rpcForm, port: value ?? 0 })} placeholder="6800" min={1} max={65535} allowUndefined /></div>
          </div>

          <div>
            <label htmlFor="rpc-secret" className="mb-1 block text-sm font-medium text-muted-foreground">{t('密钥', 'Secret')}</label>
            <div className="relative">
              <Input id="rpc-secret" type={showSecret ? 'text' : 'password'} value={rpcForm.secret || ''} onChange={(event) => { setRpcForm({ ...rpcForm, secret: event.target.value || undefined }); if (event.target.value) clearStoredSecret(); }} placeholder={hasStoredSecret ? t('已保存密钥，留空则保留', 'Secret saved, leave blank to keep') : t('可选，对应 aria2 的 --rpc-secret', 'Optional, aria2 --rpc-secret')} className="pr-10" />
              <Button type="button" variant="ghost" size="icon" aria-label={showSecret ? t('隐藏密钥', 'Hide secret') : t('显示密钥', 'Show secret')} onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2"><span className="sr-only">{showSecret ? t('隐藏密钥', 'Hide secret') : t('显示密钥', 'Show secret')}</span>{showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t('需要运行 aria2 并启用 RPC（aria2c --enable-rpc --rpc-listen-port=6800）。', 'Requires aria2 with RPC enabled (aria2c --enable-rpc --rpc-listen-port=6800).')}</p>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => void testRpc()} disabled={rpcTesting || !rpcForm.host || !rpcForm.port} variant="secondary">{rpcTesting ? <><Loader2 className="h-4 w-4 animate-spin" />{t('测试中…', 'Testing…')}</> : t('测试连接', 'Test Connection')}</Button>
            <Button onClick={() => void saveRpc()} disabled={rpcSaving || !hasRpcChanges || !isRpcFormValid}>{rpcSaving ? <><Loader2 className="h-4 w-4 animate-spin" />{t('保存中…', 'Saving…')}</> : t('保存', 'Save')}</Button>
          </div>
          {rpcTestResult && <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${rpcTestResult.success ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
            {rpcTestResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{rpcTestResult.success ? `${t('连接成功', 'Connection successful')}${rpcTestResult.version ? ` (aria2 v${rpcTestResult.version})` : ''}` : rpcTestResult.error || t('连接失败', 'Connection failed')}</span>
          </div>}
        </div>}
      </div>
    </div>
  );
};
