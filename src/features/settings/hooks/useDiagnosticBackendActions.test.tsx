import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '../../../services/logger';
import { useDiagnosticBackendActions } from './useDiagnosticBackendActions';

const backendMock = vi.hoisted(() => ({
  isAvailable: true,
  isWorkerEnvMode: false,
  backendUrl: 'http://backend.test',
}));

vi.mock('../../../services/backendAdapter', () => ({ backend: backendMock }));

const entry = {
  timestamp: '2026-08-25T00:00:00.000Z',
  level: 'info',
  message: 'Backend is healthy',
} as LogEntry;

describe('useDiagnosticBackendActions', () => {
  beforeEach(() => {
    backendMock.isAvailable = true;
    backendMock.isWorkerEnvMode = false;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('backend unavailable')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves displayed backend logs when a later refresh fails', async () => {
    const { result } = renderHook(() => useDiagnosticBackendActions({ selectedScope: 'frontend' }));
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [entry],
      headers: { get: (name: string) => name === 'X-Log-Count' ? '1' : null },
    } as unknown as Response);

    await act(async () => { await result.current.refresh(); });
    expect(result.current.backendEntries).toEqual([entry]);
    expect(result.current.backendLogCount).toBe(1);

    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    await act(async () => { await result.current.refresh(); });

    expect(result.current.backendEntries).toEqual([entry]);
    expect(result.current.backendLogCount).toBe(1);
  });

  it('does not probe Docker diagnostics in Worker ENV mode', () => {
    backendMock.isWorkerEnvMode = true;

    const { result } = renderHook(() => useDiagnosticBackendActions({ selectedScope: 'all' }));

    expect(result.current.backendAvailable).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
