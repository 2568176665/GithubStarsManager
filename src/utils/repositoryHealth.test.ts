import { describe, expect, it } from 'vitest';
import type { Release, Repository } from '../types';
import {
  deriveRepositoryHealthSnapshot,
  groupRepositoryHealthFacts,
  hasDeclaredLicense,
  hasRecentActivity,
} from './repositoryHealth';

const repository: Repository = {
  id: 1,
  name: 'example',
  full_name: 'owner/example',
  description: null,
  html_url: 'https://github.com/owner/example',
  stargazers_count: 100,
  forks_count: 5,
  forks: 5,
  language: 'TypeScript',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  pushed_at: '2026-01-01T00:00:00.000Z',
  owner: { login: 'owner', avatar_url: '' },
  topics: [],
};

const release = (id: number, tagName: string, publishedAt: string, prerelease = false): Release => ({
  id,
  tag_name: tagName,
  name: tagName,
  body: null,
  published_at: publishedAt,
  html_url: `https://github.com/owner/example/releases/tag/${tagName}`,
  assets: [],
  prerelease,
  repository: { id: 1, full_name: 'owner/example', name: 'example' },
});

describe('repository health facts', () => {
  it('keeps release facts unknown until release data is available', () => {
    const snapshot = deriveRepositoryHealthSnapshot(repository, undefined, Date.parse('2026-02-01T00:00:00.000Z'));
    const releaseFact = groupRepositoryHealthFacts(snapshot)
      .flatMap((group) => group.facts)
      .find((fact) => fact.id === 'hasReleases');

    expect(releaseFact?.value).toBeUndefined();
    expect(snapshot.signals.map((signal) => signal.id)).not.toContain('no-releases');
  });

  it('derives releases, status signals, and stable version from local releases', () => {
    const archivedRepository = {
      ...repository,
      archived: true,
      disabled: true,
      license: null,
      pushed_at: '2024-01-01T00:00:00.000Z',
    };
    const snapshot = deriveRepositoryHealthSnapshot(
      archivedRepository,
      [
        release(1, 'v2.0.0-beta.1', '2026-01-15T00:00:00.000Z', true),
        release(2, 'v1.0.0', '2025-12-15T00:00:00.000Z'),
      ],
      Date.parse('2026-02-01T00:00:00.000Z'),
    );

    expect(snapshot.hasReleases).toBe(true);
    expect(snapshot.releaseCount).toBe(2);
    expect(snapshot.latestStableVersion).toBe('v1.0.0');
    expect(snapshot.signals.map((signal) => signal.id)).toEqual(['archived', 'disabled', 'no-recent-activity']);
    expect(snapshot.license).toBeNull();
  });

  it('distinguishes a loaded empty release list from an unavailable list', () => {
    const snapshot = deriveRepositoryHealthSnapshot(repository, []);
    expect(snapshot.releasesFetched).toBe(true);
    expect(snapshot.hasReleases).toBe(false);
    expect(snapshot.signals.map((signal) => signal.id)).toContain('no-releases');
  });

  it('uses the same license and recent-activity semantics as search filters', () => {
    const now = Date.parse('2026-02-01T00:00:00.000Z');
    expect(hasRecentActivity(repository, now)).toBe(true);
    expect(hasRecentActivity({ ...repository, pushed_at: '2024-01-01T00:00:00.000Z' }, now)).toBe(false);
    expect(hasDeclaredLicense({ license: 'MIT' })).toBe(true);
    expect(hasDeclaredLicense({ license: null })).toBe(false);
  });
});
