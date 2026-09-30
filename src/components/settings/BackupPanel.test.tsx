import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useBackupActions: vi.fn(),
  useAppStore: vi.fn(),
}));

vi.mock('../../features/settings/hooks/useBackupActions', () => ({ useBackupActions: mocks.useBackupActions }));
vi.mock('../../store/useAppStore', () => ({ useAppStore: mocks.useAppStore }));
vi.mock('./IncludeKeysToggle', () => ({ IncludeKeysToggle: () => null }));

import { BackupPanel } from './BackupPanel';

describe('BackupPanel', () => {
  beforeEach(() => {
    mocks.useBackupActions.mockReturnValue({
      activeConfig: undefined,
      isBackingUp: false,
      isRestoring: false,
      backup: vi.fn(),
      restore: vi.fn(),
    });
    mocks.useAppStore.mockImplementation((selector?: (state: { lastBackup: null }) => unknown) => (
      selector ? selector({ lastBackup: null }) : { lastBackup: null }
    ));
  });

  it('keeps local export in Data Management and only shows WebDAV actions here', () => {
    render(<BackupPanel t={(zh) => zh} />);

    expect(screen.getByText('本机导出请前往“数据管理”页面。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下载到本机' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始备份' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始恢复' })).toBeInTheDocument();
  });
});
