import type { AssetFilter, Release, ReleaseAsset } from '../types';

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.reduce<string[]>((result, item) => {
    if (typeof item !== 'string') return result;
    const value = item.trim();
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return result;
    seen.add(key);
    result.push(value);
    return result;
  }, []);
};

/** Normalize persisted filters and discard legacy/temporary fields. */
export function normalizeAssetFilter(value: unknown): AssetFilter | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== 'string' || !source.id.trim() || typeof source.name !== 'string' || !source.name.trim()) return null;

  const filter: AssetFilter = {
    id: source.id,
    name: source.name.trim(),
    keywords: normalizeStringList(source.keywords),
  };
  const excludeKeywords = normalizeStringList(source.excludeKeywords);
  const includeRepos = normalizeStringList(source.includeRepos);
  const alwaysExcludeRepos = normalizeStringList(source.alwaysExcludeRepos);
  if (excludeKeywords.length) filter.excludeKeywords = excludeKeywords;
  if (includeRepos.length) filter.includeRepos = includeRepos;
  if (alwaysExcludeRepos.length) filter.alwaysExcludeRepos = alwaysExcludeRepos;
  if (source.isPreset === true) filter.isPreset = true;
  if (typeof source.icon === 'string' && source.icon.trim()) filter.icon = source.icon.trim();
  return filter;
}

export function normalizeAssetFilters(value: unknown): AssetFilter[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeAssetFilter).filter((filter): filter is AssetFilter => filter !== null);
}

const includesIgnoreCase = (values: string[] | undefined, value: string) =>
  (values ?? []).some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase());

const containsKeyword = (names: string[], keywords: string[]) =>
  names.some(name => keywords.some(keyword => name.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())));

export interface ReleaseAssetNames {
  /** GitHub uploaded assets only. */
  uploaded: string[];
  /** All displayed links, including GitHub's zipball/tarball pseudo-source links. */
  all: string[];
}

export function releaseAssetNames(release: Release): ReleaseAssetNames {
  const uploaded = (release.assets ?? []).map((asset: ReleaseAsset) => asset.name);
  const all = [...uploaded];
  if (release.zipball_url) all.push(`Source code (${release.tag_name}.zip)`);
  if (release.tarball_url) all.push(`Source code (${release.tag_name}.tar.gz)`);
  return { uploaded, all };
}

/** Whether a single filter makes a release visible. Filters are ORed by callers. */
export function matchesAssetFilter(filter: AssetFilter, repositoryFullName: string, names: ReleaseAssetNames): boolean {
  const normalized = normalizeAssetFilter(filter);
  if (!normalized) return false;
  const repository = repositoryFullName.trim();

  if (includesIgnoreCase(normalized.alwaysExcludeRepos, repository)) return false;

  const hasIncludeRepos = (normalized.includeRepos?.length ?? 0) > 0;
  if (hasIncludeRepos && !includesIgnoreCase(normalized.includeRepos, repository)) return false;

  const hasIncludeKeywords = normalized.keywords.length > 0;
  const hasExcludeKeywords = (normalized.excludeKeywords?.length ?? 0) > 0;
  const excluded = hasExcludeKeywords && containsKeyword(
    hasIncludeKeywords || hasIncludeRepos ? names.all : names.uploaded,
    normalized.excludeKeywords!,
  );
  if (excluded) return false;

  // A repository allow-list is a positive rule and bypasses filename matching.
  if (hasIncludeRepos) return true;
  if (hasIncludeKeywords) return containsKeyword(names.all, normalized.keywords);

  // An always-exclude list alone means every other repository is included.
  if ((normalized.alwaysExcludeRepos?.length ?? 0) > 0 && !hasExcludeKeywords) return true;

  // Exclusion-only filters need a real uploaded asset to avoid matching every
  // release that only has GitHub's automatically generated source archives.
  return hasExcludeKeywords && names.uploaded.length > 0;
}

export function matchesReleaseAssetFilters(
  filters: AssetFilter[],
  repositoryFullName: string,
  names: ReleaseAssetNames,
): boolean {
  return filters.some(filter => matchesAssetFilter(filter, repositoryFullName, names));
}
