import { describe, expect, it } from 'vitest';
import type { AssetFilter } from '../types';
import { matchesAssetFilter, normalizeAssetFilter, normalizeAssetFilters } from './assetFilters';

const names = (uploaded: string[], all = uploaded) => ({ uploaded, all });

describe('asset filters', () => {
  it('normalizes known lists and drops the legacy excludeRepos field', () => {
    expect(normalizeAssetFilter({
      id: 'f', name: ' Filter ', keywords: [' Mac ', 'mac'], excludeKeywords: [' DEBUG ', 'debug'],
      includeRepos: ['Owner/Repo', 'owner/repo'], excludeRepos: ['wrong/repo'], temporary: true,
    })).toEqual({
      id: 'f', name: 'Filter', keywords: ['Mac'], excludeKeywords: ['DEBUG'], includeRepos: ['Owner/Repo'],
    });
    expect(normalizeAssetFilters([{ id: 'bad' }, null])).toEqual([]);
  });

  it('applies repository exclusions before includes and allows repository-only rules', () => {
    const filter: AssetFilter = { id: 'f', name: 'repo', keywords: [], includeRepos: ['Owner/Repo'], alwaysExcludeRepos: ['owner/repo'] };
    expect(matchesAssetFilter(filter, 'owner/repo', names(['app.zip']))).toBe(false);
    expect(matchesAssetFilter({ ...filter, alwaysExcludeRepos: [] }, 'OWNER/REPO', names([]))).toBe(true);
    expect(matchesAssetFilter(filter, 'owner/other', names(['app.zip']))).toBe(false);
    expect(matchesAssetFilter({ id: 'f', name: 'all-except', keywords: [], alwaysExcludeRepos: ['owner/blocked'] }, 'owner/other', names([]))).toBe(true);
  });

  it('uses uploaded assets for exclusion-only rules and all links for positive rules', () => {
    const exclusionOnly: AssetFilter = { id: 'f', name: 'exclude', keywords: [], excludeKeywords: ['source'] };
    expect(matchesAssetFilter(exclusionOnly, 'owner/repo', names([], ['Source code (v1.zip)']))).toBe(false);
    expect(matchesAssetFilter(exclusionOnly, 'owner/repo', names(['app.zip']))).toBe(true);
    expect(matchesAssetFilter({ ...exclusionOnly, keywords: ['zip'] }, 'owner/repo', names([], ['Source code (v1.zip)']))).toBe(false);
    expect(matchesAssetFilter({ ...exclusionOnly, keywords: ['source'] }, 'owner/repo', names([], ['Source code (v1.zip)']))).toBe(false);
  });

  it('does not match a filter without a positive rule', () => {
    expect(matchesAssetFilter({ id: 'f', name: 'empty', keywords: [] }, 'owner/repo', names(['app.zip']))).toBe(false);
  });
});
