import { useCallback } from 'react';
import { GitHubApiService } from '../../../services/githubApi';
import { backend } from '../../../services/backendAdapter';
import { syncFromBackend } from '../../../services/autoSync';
import type { GitHubUser } from '../../../types';

export interface LoginActions {
  authenticateWithGitHub: (token: string) => Promise<GitHubUser>;
  fetchManagedSession: () => Promise<GitHubUser>;
  workerManaged: boolean;
  syncBackendData: () => Promise<void>;
}

export const useLoginActions = (): LoginActions => {
  const authenticateWithGitHub = useCallback(async (token: string) => {
    return new GitHubApiService(token).getCurrentUser();
  }, []);
  const fetchManagedSession = useCallback(async () => {
    return (await backend.fetchManagedSession()) as unknown as GitHubUser;
  }, []);
  const syncBackendData = useCallback(async () => {
    await syncFromBackend();
  }, []);

  return {
    authenticateWithGitHub,
    fetchManagedSession,
    workerManaged: backend.isWorkerEnvMode,
    syncBackendData,
  };
};
