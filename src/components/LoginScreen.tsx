import React, { useState } from 'react';
import { AlertCircle, Github, Key, Moon, Sun } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useLoginActions } from '../features/lifecycle/hooks/useLoginActions';
import { useAppStore } from '../store/useAppStore';
import { safeReadText } from '../utils/clipboardUtils';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export const LoginScreen: React.FC = () => {
  const { authenticateWithGitHub, fetchManagedSession, workerManaged } = useLoginActions();
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const {
    setUser,
    setGitHubToken,
    repositories,
    lastSync,
    language,
    setLanguage,
    theme,
    setTheme,
  } = useAppStore(useShallow((state) => ({
    setUser: state.setUser,
    setGitHubToken: state.setGitHubToken,
    repositories: state.repositories,
    lastSync: state.lastSync,
    language: state.language,
    setLanguage: state.setLanguage,
    theme: state.theme,
    setTheme: state.setTheme,
  })));
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;

  const handleConnect = async () => {
    if (!workerManaged && !token.trim()) {
      setError(t('请输入有效的 GitHub token', 'Please enter a valid GitHub token'));
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const user = workerManaged
        ? await fetchManagedSession()
        : await authenticateWithGitHub(token.trim());
      setGitHubToken(workerManaged ? 'worker-managed' : token.trim());
      setUser(user);
    } catch (connectError) {
      setError(connectError instanceof Error
        ? connectError.message
        : t('认证失败，请检查配置后重试。', 'Authentication failed. Please check your configuration and try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      void handleConnect();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && !isLoading) {
      const result = await safeReadText();
      if (result.success && result.text) {
        setToken(result.text.trim());
        setError('');
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground transition-colors duration-300">
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-md border border-border bg-card">
          <Button type="button" variant={language === 'zh' ? 'secondary' : 'ghost'} size="sm" onClick={() => setLanguage('zh')} aria-pressed={language === 'zh'} className="w-16 rounded-none">中文</Button>
          <Button type="button" variant={language === 'en' ? 'secondary' : 'ghost'} size="sm" onClick={() => setLanguage('en')} aria-pressed={language === 'en'} className="w-16 rounded-none">EN</Button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="border border-border bg-card" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={t('切换主题', 'Toggle theme')}>
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('切换主题', 'Toggle theme')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <img src="./icon.png" alt="GitHub Stars Manager" className="h-full w-full object-cover" />
          </div>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">GitHub Stars Manager</h1>
          <p className="text-sm text-muted-foreground">{t('AI 驱动的仓库管理工具', 'AI-powered repository management')}</p>
        </div>

        <Card className="border-border bg-card p-6 shadow-sm sm:p-7">
          <div className="mb-6 text-center">
            <Github className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="mb-2 text-lg font-semibold tracking-tight text-foreground">{t('连接 GitHub', 'Connect GitHub')}</h2>
            <p className="text-sm text-muted-foreground">
              {workerManaged
                ? t('当前 Worker 已配置 GitHub 账号，直接连接即可开始使用。', 'This Worker has a managed GitHub account configured. Connect to continue.')
                : t('输入 GitHub Personal Access Token 以开始使用。', 'Enter a GitHub Personal Access Token to get started.')}
            </p>
          </div>

          {repositories.length > 0 && lastSync && (
            <div className="mb-4 rounded-md border border-success/30 bg-success/10 p-3 text-success">
              <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-success" /><span className="text-sm font-medium">{t(`已缓存 ${repositories.length} 个仓库`, `${repositories.length} repositories cached`)}</span></div>
              <p className="mt-1 text-xs text-success">{t('上次同步:', 'Last sync:')} {new Date(lastSync).toLocaleString()}</p>
            </div>
          )}

          {!workerManaged && (
            <div className="space-y-2">
              <Label htmlFor="github-token">GitHub Personal Access Token</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground/70" />
                <Input id="github-token" type="password" autoComplete="current-password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" value={token} onChange={(event) => { setToken(event.target.value); setError(''); }} onKeyDown={handleKeyDown} disabled={isLoading} className="pl-10" />
              </div>
            </div>
          )}

          {error && <div role="alert" className="mt-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /><p className="text-sm">{error}</p></div>}

          <Button type="button" onClick={() => void handleConnect()} disabled={isLoading || (!workerManaged && !token.trim())} className="mt-4 w-full">
            {isLoading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /><span>{t('连接中…', 'Connecting…')}</span></> : t('连接到 GitHub', 'Connect to GitHub')}
          </Button>

          {!workerManaged && <div className="mt-6 rounded-md border border-border bg-muted/50 p-4">
            <h3 className="mb-2 text-sm font-medium text-foreground">{t('如何创建 GitHub token:', 'How to create a GitHub token:')}</h3>
            <ol className="space-y-1 text-xs leading-5 text-muted-foreground">
              <li>1. {t('访问 GitHub Settings → Developer settings → Personal access tokens', 'Go to GitHub Settings → Developer settings → Personal access tokens')}</li>
              <li>2. {t('点击 Generate new token (classic)', 'Click Generate new token (classic)')}</li>
              <li>3. {t('选择所需权限范围并复制 token', 'Select the required scopes and copy the token')}</li>
            </ol>
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">{t('在 GitHub 上创建 token →', 'Create a token on GitHub →')}</a>
          </div>}
        </Card>
      </div>
    </div>
  );
};
