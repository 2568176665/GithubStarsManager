
import { defaultReleaseSourceSettings } from '../../types';
import { logger } from '../../services/logger';
import type { AppStoreSlice } from '../types';
import { clearAuthMirror, writeAuthMirror } from '../persistence/authStorage';

export const createAuthSlice: AppStoreSlice<Pick<import('../types').AppActions, 'setUser' | 'setGitHubToken' | 'logout'>> = (set, get) => ({
      // Auth actions
      setUser: (user) => {
        logger.info('store.setUser', 'Setting user', { hasUser: !!user });
        set({ user, isAuthenticated: !!user });
        const { githubToken } = get();
        writeAuthMirror({ user, githubToken });
      },
      setGitHubToken: (token) => {
        logger.info('store.setGitHubToken', 'Setting GitHub token', { hasToken: !!token });
        set({ githubToken: token });
        const { user } = get();
        writeAuthMirror({ user, githubToken: token });
      },
      logout: () => {
        // Full credential teardown for the browser-local GitHub session.
        clearAuthMirror();
        set({
          user: null,
          githubToken: null,
          isAuthenticated: false,
          repositories: [],
          gists: [],
          starredGists: [],
          gistSearchResults: [],
          analyzingGistIds: new Set(),
          releases: [],
          releaseSubscriptions: new Set(),
          releaseSourceSettings: defaultReleaseSourceSettings,
          readReleases: new Set(),
          forks: [],
          readForks: new Set(),
          analyzingRepositoryIds: new Set(),
          searchResults: [],
          similarView: null,
          lastSync: null,
        });
      },

});
