import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { WebDAVConfig } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { useDialog } from '../../../hooks/useDialog';
import { WebDAVService } from '../../../services/webdavService';
import { createBackupDocument, parseBackupDocument, restoreBackupDocument } from '../backup/backupService';

interface UseBackupActionsOptions {
  t: (zh: string, en: string) => string;
}

export interface BackupActions {
  activeConfig: WebDAVConfig | undefined;
  isBackingUp: boolean;
  isRestoring: boolean;
  backup: () => Promise<void>;
  restore: () => Promise<void>;
}

const buildContent = async () => JSON.stringify(await createBackupDocument(), null, 2);

export const useBackupActions = ({ t }: UseBackupActionsOptions): BackupActions => {
  const { webdavConfigs, activeWebDAVConfig, setLastBackup } = useAppStore(useShallow((store) => ({
    webdavConfigs: store.webdavConfigs,
    activeWebDAVConfig: store.activeWebDAVConfig,
    setLastBackup: store.setLastBackup,
  })));
  const { toast, confirm } = useDialog();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const activeConfig = useMemo(
    () => webdavConfigs.find((config) => config.id === activeWebDAVConfig),
    [activeWebDAVConfig, webdavConfigs],
  );

  const backup = useCallback(async () => {
    if (!activeConfig) {
      toast(t('请先配置并激活WebDAV服务。', 'Please configure and activate WebDAV service first.'), 'error');
      return;
    }
    setIsBackingUp(true);
    try {
      const content = await buildContent();
      const filename = `github-stars-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const success = await new WebDAVService(activeConfig).uploadFile(filename, content);
      if (!success) throw new Error(t('WebDAV 上传失败', 'WebDAV upload failed'));
      setLastBackup(new Date().toISOString());
      toast(t('数据备份成功！', 'Data backup successful!'), 'success');
    } catch (error) {
      console.error('Backup failed:', error);
      toast(`${t('备份失败', 'Backup failed')}: ${(error as Error).message}`, 'error');
    } finally {
      setIsBackingUp(false);
    }
  }, [activeConfig, setLastBackup, t, toast]);

  const restore = useCallback(async () => {
    if (!activeConfig) {
      toast(t('请先配置并激活WebDAV服务。', 'Please configure and activate WebDAV service first.'), 'error');
      return;
    }
    const confirmed = await confirm(
      t('恢复数据', 'Restore Data'),
      t('恢复数据将覆盖当前已有的备份内容，是否继续？', 'Restoring data will replace backed-up data currently in this browser. Continue?'),
      { type: 'warning' },
    );
    if (!confirmed) return;

    setIsRestoring(true);
    try {
      const service = new WebDAVService(activeConfig);
      const files = await service.listFiles();
      const backupFiles = files.filter((file) => file.startsWith('github-stars-backup-'));
      if (backupFiles.length === 0) throw new Error(t('未找到备份文件。', 'No backup files found.'));
      const content = await service.downloadFile(backupFiles.sort().reverse()[0]);
      if (!content) throw new Error(t('备份文件内容为空，无法恢复。', 'Backup file is empty, cannot restore.'));
      const document = parseBackupDocument(JSON.parse(content));
      await restoreBackupDocument(document, 'replace');
      toast(t('数据已从备份恢复。', 'Data restored from backup.'), 'success');
    } catch (error) {
      console.error('Restore failed:', error);
      toast(`${t('恢复失败', 'Restore failed')}: ${(error as Error).message}`, 'error');
    } finally {
      setIsRestoring(false);
    }
  }, [activeConfig, confirm, t, toast]);

  return { activeConfig, isBackingUp, isRestoring, backup, restore };
};
