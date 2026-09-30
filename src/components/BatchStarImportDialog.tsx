import { useState, type FC } from 'react';
import { AlertCircle, Check, Loader2, Star, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { BATCH_STAR_IMPORT_LIMIT, useBatchStarImport } from '../features/repositories/hooks/useBatchStarImport';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';

interface BatchStarImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSynced?: () => Promise<void>;
}

const statusLabel = (status: string, t: (zh: string, en: string) => string): string => {
  switch (status) {
    case 'resolving': return t('正在检查', 'Checking');
    case 'starred': return t('已 Star', 'Already starred');
    case 'success': return t('已添加', 'Starred');
    case 'resolve-error': return t('检查失败', 'Check failed');
    case 'star-error': return t('添加失败', 'Star failed');
    default: return t('可添加', 'Ready');
  }
};

export const BatchStarImportDialog: FC<BatchStarImportDialogProps> = ({ open, onClose, onSynced }) => {
  const language = useAppStore(state => state.language);
  const githubToken = useAppStore(state => state.githubToken);
  const [input, setInput] = useState('');
  const [translateDescriptions, setTranslateDescriptions] = useState(false);
  const {
    rows,
    duplicates,
    invalid,
    isResolving,
    isStarring,
    starProgress,
    translationError,
    syncError,
    resolveInput,
    toggleSelected,
    selectAllReady,
    starSelected,
    reset,
  } = useBatchStarImport(onSynced);
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;
  const busy = isResolving || isStarring;
  const selectedCount = rows.filter(row => row.selected && row.isStarred === false && row.status !== 'success').length;
  const successfulCount = rows.filter(row => row.status === 'success').length;
  const failedCount = rows.filter(row => row.status === 'star-error' || row.status === 'resolve-error').length;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    if (busy) return;
    reset();
    setInput('');
    setTranslateDescriptions(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl" closeLabel={t('关闭', 'Close')}>
        <DialogHeader>
          <DialogTitle>{t('从链接批量 Star', 'Star repositories from links')}</DialogTitle>
          <DialogDescription>
            {t(`粘贴 GitHub 仓库链接、Markdown、owner/repo 或 JSON。每批最多检查 ${BATCH_STAR_IMPORT_LIMIT} 个仓库。`, `Paste GitHub repository links, Markdown, owner/repo references, or JSON. Up to ${BATCH_STAR_IMPORT_LIMIT} repositories per batch.`)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={busy}
            maxLength={200_000}
            rows={5}
            aria-label={t('仓库链接或 JSON', 'Repository links or JSON')}
            placeholder={t('https://github.com/owner/repo\n[项目](https://github.com/owner/another-repo)', 'https://github.com/owner/repo\n[Project](https://github.com/owner/another-repo)')}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={translateDescriptions}
                onCheckedChange={(checked) => setTranslateDescriptions(checked === true)}
                disabled={busy}
                aria-label={t('翻译仓库描述', 'Translate repository descriptions')}
              />
              {t('翻译仓库描述', 'Translate repository descriptions')}
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void resolveInput(input, translateDescriptions)}
              disabled={!githubToken || busy || !input.trim()}
            >
              {isResolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('解析并检查', 'Parse and check')}
            </Button>
          </div>
          {!githubToken && <p className="text-sm text-destructive">{t('请先连接 GitHub。', 'Connect to GitHub first.')}</p>}
        </div>

        {(rows.length > 0 || duplicates.length > 0 || invalid.length > 0) && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {t(`${rows.length} 个仓库`, `${rows.length} repositories`)} · {t(`已选 ${selectedCount}`, `${selectedCount} selected`)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => selectAllReady(!rows.some(row => row.selected && (row.status === 'ready' || row.status === 'star-error')))}
                disabled={busy || !rows.some(row => row.status === 'ready' || row.status === 'star-error')}
              >
                {rows.some(row => row.selected && (row.status === 'ready' || row.status === 'star-error')) ? t('取消全选', 'Clear selection') : t('全选未 Star', 'Select unstarred')}
              </Button>
            </div>
            <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {rows.map(row => (
                <div key={row.fullName.toLocaleLowerCase()} className="flex items-start gap-3 p-3">
                  <Checkbox
                    checked={row.selected}
                    onCheckedChange={(checked) => toggleSelected(row.fullName, checked === true)}
                    disabled={busy || (row.status !== 'ready' && row.status !== 'star-error')}
                    aria-label={t(`选择 ${row.fullName}`, `Select ${row.fullName}`)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`https://github.com/${row.fullName}`} target="_blank" rel="noreferrer" className="truncate font-medium text-primary hover:underline">
                        {row.fullName}
                      </a>
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${row.status === 'resolve-error' || row.status === 'star-error' ? 'bg-destructive/10 text-destructive' : row.status === 'success' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        {row.status === 'success' ? <Check className="h-3 w-3" /> : row.status === 'resolve-error' || row.status === 'star-error' ? <AlertCircle className="h-3 w-3" /> : row.status === 'starred' ? <Star className="h-3 w-3" /> : null}
                        {statusLabel(row.status, t)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.repository?.description || t('无描述', 'No description')}
                    </p>
                    {row.translatedDescription && row.translatedDescription !== row.repository?.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{row.translatedDescription}</p>
                    )}
                    {row.repository && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        ★ {row.repository.stargazers_count.toLocaleString()} · {row.repository.language || t('未知语言', 'Unknown language')}
                      </p>
                    )}
                    {row.error && <p className="mt-1 break-words text-xs text-destructive">{row.error}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(duplicates.length > 0 || invalid.length > 0) && (
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {t(`忽略了 ${duplicates.length + invalid.length} 项`, `Skipped ${duplicates.length + invalid.length} items`)}
            </summary>
            <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {duplicates.map((value, index) => <li key={`duplicate-${index}`}>{value} — {t('重复', 'duplicate')}</li>)}
              {invalid.map((issue, index) => <li key={`invalid-${index}`}>{issue.value} — {issue.reason}</li>)}
            </ul>
          </details>
        )}

        {translationError && <p className="text-sm text-destructive">{t('描述翻译失败，仍可使用原文。', 'Description translation failed; original descriptions are still available.')}</p>}
        {syncError && <p className="text-sm text-destructive">{t('Star 已完成，但同步本地列表失败：', 'Repositories were starred, but local sync failed:')} {syncError}</p>}
        {isStarring && (
          <p className="text-sm text-muted-foreground" role="status">
            {t(`正在添加：${starProgress.done}/${starProgress.total}`, `Starring: ${starProgress.done}/${starProgress.total}`)}
          </p>
        )}
        {!isStarring && successfulCount > 0 && (
          <p className="text-sm text-green-700 dark:text-green-400" role="status">
            {t(`成功添加 ${successfulCount} 个仓库`, `Starred ${successfulCount} repositories`)}
            {failedCount > 0 && ` · ${t(`失败 ${failedCount} 个`, `${failedCount} failed`)}`}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
            <X className="mr-2 h-4 w-4" />{t('关闭', 'Close')}
          </Button>
          <Button type="button" onClick={() => void starSelected()} disabled={busy || selectedCount === 0}>
            {isStarring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Star className="mr-2 h-4 w-4" />
            {t(`Star 已选仓库 (${selectedCount})`, `Star selected (${selectedCount})`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
