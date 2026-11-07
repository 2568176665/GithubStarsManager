
import { TranslateFn } from '../../i18n/useT';
import React, { useState } from 'react';
import { ArrowRight, ExternalLink, Key, Mail, Package } from 'lucide-react';
import { Github, Twitter } from '../ui/brand-icons';
import { UpdateChecker } from '../UpdateChecker';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { version } from '../../../package.json';
import { PROJECT_REPO_URL } from '../../constants/project';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useGitHubTokenActions } from '../../features/settings/hooks/useGitHubTokenActions';
import { GitHubTokenPermissions } from '../GitHubTokenPermissions';

interface GeneralPanelProps {
  t: TranslateFn;
}

export const GeneralPanel: React.FC<GeneralPanelProps> = ({ t }) => {
  const { user } = useAppStore(useShallow((state) => ({
    user: state.user,
  })));
  const githubToken = useGitHubTokenActions();
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Package className="h-6 w-6 text-muted-foreground dark:text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground dark:text-foreground">{t('generalPanel.general-settings')}</h3>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Package className="h-5 w-5 text-muted-foreground dark:text-muted-foreground" />
            <CardTitle>{t('generalPanel.check-for-updates')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-sm text-muted-foreground dark:text-muted-foreground">{t('generalPanel.current-version-v-version', { version: version })}</p>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">{t('generalPanel.check-if-a-new-version-is-available')}</p>
          </div>
          <UpdateChecker />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Key className="h-5 w-5 text-muted-foreground dark:text-muted-foreground" />
            <CardTitle>{t('generalPanel.github-token')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground dark:text-muted-foreground">
            {user?.login
              ? t('generalPanel.account-token-hint', { login: user.login })
              : t('generalPanel.token-hint')}
          </p>
          <div className="space-y-2">
            <Label htmlFor="settings-github-token">GitHub Personal Access Token</Label>
            <Input
              id="settings-github-token"
              type="password"
              autoComplete="off"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={githubToken.tokenInput}
              onChange={(event) => githubToken.setTokenInput(event.target.value)}
              disabled={githubToken.isSaving}
            />
          </div>
          <Button type="button" onClick={() => { void githubToken.updateToken(); }} disabled={githubToken.isSaving || !githubToken.tokenInput.trim()}>
            {githubToken.isSaving ? t('generalPanel.updating') : t('generalPanel.update-token')}
          </Button>
          <Button type="button" variant="link" className="mt-2 h-auto p-0 text-sm" onClick={() => setGuideOpen(true)}>
            {t('generalPanel.token-permission-guide')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('generalPanel.token-permission-guide')}</DialogTitle>
          </DialogHeader>
          <GitHubTokenPermissions heading={false} />
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Mail className="h-5 w-5 text-muted-foreground dark:text-muted-foreground" />
            <CardTitle>{t('generalPanel.contact-information')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground dark:text-muted-foreground">{t('generalPanel.if-you-encounter-any-issues-or-have-suggestions')}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={() => { const newWindow = window.open('https://x.com/GoodMan_Lee', '_blank', 'noopener,noreferrer'); if (newWindow) newWindow.opener = null; }} className="gap-2">
              <Twitter className="h-5 w-5" />
              <span>Twitter</span>
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" onClick={() => { const newWindow = window.open(PROJECT_REPO_URL, '_blank', 'noopener,noreferrer'); if (newWindow) newWindow.opener = null; }} className="gap-2">
              <Github className="h-5 w-5" />
              <span>{t('generalPanel.github')}</span>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
