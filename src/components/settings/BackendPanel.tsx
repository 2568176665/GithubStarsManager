import React from 'react';
import { CheckCircle, RefreshCw, Route, Server, Upload } from 'lucide-react';
import type { RouteMode } from '../../types';
import { useBackendSettingsActions } from '../../features/settings/hooks/useBackendSettingsActions';
import { useAppStore } from '../../store/useAppStore';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

interface BackendPanelProps {
  t: (zh: string, en: string) => string;
}

export const BackendPanel: React.FC<BackendPanelProps> = ({ t }) => {
  const routeMode = useAppStore((state) => state.routeMode);
  const setRouteMode = useAppStore((state) => state.setRouteMode);
  const { checking, health, syncing, check, sync } = useBackendSettingsActions();

  const routeOptions: Array<{ value: RouteMode; label: string; hint: string }> = [
    { value: 'auto', label: t('智能', 'Auto'), hint: t('有 Worker 代理时优先使用 Worker，否则浏览器直连。', 'Use the Worker when available, otherwise use the browser directly.') },
    { value: 'backend', label: t('优先走 Worker', 'Prefer Worker'), hint: t('支持代理的 GitHub/Release 请求优先经 Worker 出站。', 'Prefer Worker egress for supported GitHub/Release requests.') },
    { value: 'browser', label: t('浏览器直连', 'Browser direct'), hint: t('跳过 Worker 代理，使用当前浏览器网络。', 'Skip the Worker proxy and use the browser network.') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Server className="h-6 w-6 text-muted-foreground" /><h3 className="text-lg font-semibold text-foreground">{t('Cloudflare Worker', 'Cloudflare Worker')}</h3></div>
        <Badge variant={checking ? 'secondary' : health ? 'default' : 'destructive'} className="gap-2 px-3 py-1 text-sm">
          {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
          {checking ? t('检查中…', 'Checking…') : health ? t('已连接', 'Connected') : t('不可用', 'Unavailable')}
        </Badge>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-center justify-between"><div><p className="font-medium text-foreground">{t('Worker 运行状态', 'Worker status')}</p><p className="text-sm text-muted-foreground">{health ? `${t('版本', 'Version')}: ${health.version ?? 'unknown'}` : t('当前页面无法访问 Worker API。', 'The Worker API is not reachable from this page.')}</p></div><Button type="button" variant="secondary" onClick={() => void check()} disabled={checking}><RefreshCw className="h-4 w-4" />{t('重新检查', 'Retry')}</Button></div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-1 flex items-center gap-2"><Route className="h-4 w-4 text-muted-foreground" /><h4 className="text-sm font-medium text-foreground">{t('网络请求路由', 'Network request routing')}</h4></div>
        <p className="mb-3 text-xs text-muted-foreground">{t('选择 GitHub/Release 请求使用 Worker 代理还是浏览器直连。此设置不会改变 D1 同步。', 'Choose Worker proxying or browser-direct requests for GitHub/Release. This does not change D1 sync.')}</p>
        <RadioGroup value={routeMode} onValueChange={(value) => setRouteMode(value as RouteMode)} className="gap-3">
          {routeOptions.map((option) => <label key={option.value} htmlFor={`route-mode-${option.value}`} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/50"><RadioGroupItem value={option.value} id={`route-mode-${option.value}`} className="mt-0.5" /><div><div className="text-sm font-medium text-foreground">{option.label}</div><div className="text-xs text-muted-foreground">{option.hint}</div></div></label>)}
        </RadioGroup>
      </div>

      {health && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Button type="button" onClick={() => void sync('up')} disabled={syncing} className="h-auto justify-center gap-2 py-3"><Upload className="h-4 w-4" />{syncing ? t('同步中…', 'Syncing…') : t('上传到 D1', 'Sync to D1')}</Button>
        <Button type="button" variant="secondary" onClick={() => void sync('down')} disabled={syncing} className="h-auto justify-center gap-2 py-3"><RefreshCw className="h-4 w-4" />{syncing ? t('同步中…', 'Syncing…') : t('从 D1 同步', 'Sync from D1')}</Button>
      </div>}

      <div className="rounded-lg bg-background p-4"><h4 className="mb-2 font-medium text-foreground">{t('同步内容包括：', 'Sync includes:')}</h4><ul className="space-y-1 text-sm text-muted-foreground"><li>• {t('GitHub Stars 仓库列表', 'GitHub Stars repository list')}</li><li>• {t('Release 发布信息', 'Release information')}</li><li>• {t('AI、WebDAV 和向量搜索配置', 'AI, WebDAV, and vector search settings')}</li><li>• {t('分类与筛选设置', 'Category and filter settings')}</li></ul></div>
    </div>
  );
};
