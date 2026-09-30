import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useNetworkActions: vi.fn(),
}));

vi.mock('../../features/settings/hooks/useNetworkActions', () => ({
  useNetworkActions: mocks.useNetworkActions,
}));

import { NetworkPanel } from './NetworkPanel';

describe('NetworkPanel RPC feedback', () => {
  beforeEach(() => {
    mocks.useNetworkActions.mockReturnValue({
      rpcForm: { enabled: false, host: '', port: 6800 },
      rpcTesting: false,
      rpcSaving: false,
      isRpcToggling: false,
      rpcTestResult: { success: false, error: '请在设置中填写 RPC 主机地址' },
      hasStoredSecret: false,
      isRpcFormValid: true,
      hasRpcChanges: false,
      setRpcForm: vi.fn(),
      clearStoredSecret: vi.fn(),
      saveRpc: vi.fn(),
      testRpc: vi.fn(),
      toggleRpc: vi.fn(),
    });
  });

  it('shows a failed enable reason after the switch rolls back to disabled', () => {
    render(<NetworkPanel t={(zh) => zh} />);

    expect(screen.getByText('请在设置中填写 RPC 主机地址')).toBeInTheDocument();
  });

  it('keeps RPC configuration visible while remote download is disabled', () => {
    render(<NetworkPanel t={(zh) => zh} />);

    expect(screen.getByLabelText('主机地址')).toBeInTheDocument();
    expect(screen.getByLabelText('端口')).toBeInTheDocument();
    expect(screen.getByLabelText('密钥')).toBeInTheDocument();
  });
});
