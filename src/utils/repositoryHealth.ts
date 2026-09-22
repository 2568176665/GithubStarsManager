import type { Release, Repository } from '../types';
import type {
  RepositoryHealthFact,
  RepositoryHealthFactId,
  RepositoryHealthGroup,
  RepositoryHealthGroupView,
  RepositoryHealthSignal,
  RepositoryHealthSnapshot,
} from '../types/health';
import { NO_LICENSE_SENTINEL, normalizeLicense } from './licenseFilter';

const MS_PER_DAY = 86_400_000;

/** 超过一年没有 push 时展示中性的“近期无活动”观测。 */
export const NO_RECENT_ACTIVITY_DAYS = 365;

const PRERELEASE_TOKENS = new Set([
  'alpha', 'beta', 'rc', 'pre', 'prerelease', 'preview', 'dev', 'devel',
  'next', 'canary', 'snapshot', 'nightly', 'insider', 'unstable',
]);

const toTimestamp = (value?: string | null): number | null => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const toCount = (value: unknown): number => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

export function isPrereleaseRelease(release: Pick<Release, 'prerelease' | 'tag_name'>): boolean {
  if (release.prerelease === true) return true;
  return release.tag_name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .some((token) => PRERELEASE_TOKENS.has(token.replace(/\d+$/, '')));
}

export function releasesForRepository(
  releases: readonly Release[] | undefined,
  repositoryId: number,
): Release[] {
  return (releases ?? [])
    .filter((release) => Number(release.repository?.id) === Number(repositoryId))
    .filter((release) => toTimestamp(release.published_at) !== null)
    .slice()
    .sort((left, right) => (
      (toTimestamp(right.published_at) as number) - (toTimestamp(left.published_at) as number)
    ));
}

export function deriveRepositoryHealthSnapshot(
  repository: Repository,
  releases?: readonly Release[],
  now: number = Date.now(),
): RepositoryHealthSnapshot {
  const ownReleases = releasesForRepository(releases, repository.id);
  const latestRelease = ownReleases[0] ?? null;
  const latestStable = ownReleases.find((release) => !isPrereleaseRelease(release)) ?? null;
  const createdTimestamp = toTimestamp(repository.created_at);
  const pushedTimestamp = toTimestamp(repository.pushed_at) ?? toTimestamp(repository.updated_at);
  const ageDays = createdTimestamp === null
    ? null
    : Math.max(0, Math.floor((now - createdTimestamp) / MS_PER_DAY));
  const daysSinceLastPush = pushedTimestamp === null
    ? null
    : Math.max(0, Math.floor((now - pushedTimestamp) / MS_PER_DAY));
  const snapshot: RepositoryHealthSnapshot = {
    archived: repository.archived,
    disabled: repository.disabled,
    fork: repository.fork,
    isTemplate: repository.is_template,
    createdAt: repository.created_at,
    pushedAt: repository.pushed_at || repository.updated_at || null,
    hasReleases: ownReleases.length > 0,
    releasesFetched: releases !== undefined,
    latestReleaseAt: latestRelease?.published_at ?? null,
    releaseCount: ownReleases.length,
    latestStableVersion: latestStable?.tag_name ?? null,
    stars: toCount(repository.stargazers_count),
    forks: toCount(repository.forks_count ?? repository.forks),
    openIssues: repository.open_issues_count === undefined
      ? undefined
      : toCount(repository.open_issues_count),
    license: repository.license,
    ageDays,
    daysSinceLastPush,
    signals: [],
  };
  snapshot.signals = deriveRepositoryHealthSignals(snapshot);
  return snapshot;
}

export function deriveRepositoryHealthSignals(snapshot: RepositoryHealthSnapshot): RepositoryHealthSignal[] {
  const signals: RepositoryHealthSignal[] = [];
  if (snapshot.archived === true) signals.push({ id: 'archived', since: null, detail: null });
  if (snapshot.disabled === true) signals.push({ id: 'disabled', since: null, detail: null });
  if (snapshot.releasesFetched && snapshot.releaseCount === 0) {
    signals.push({ id: 'no-releases', since: null, detail: null });
  }
  if (snapshot.daysSinceLastPush !== null && snapshot.daysSinceLastPush >= NO_RECENT_ACTIVITY_DAYS) {
    signals.push({ id: 'no-recent-activity', since: toTimestamp(snapshot.pushedAt), detail: snapshot.pushedAt });
  }
  return signals;
}

export function hasRecentActivity(
  repository: Pick<Repository, 'pushed_at' | 'updated_at'>,
  now: number = Date.now(),
): boolean {
  const pushed = toTimestamp(repository.pushed_at) ?? toTimestamp(repository.updated_at);
  return pushed !== null && now - pushed < NO_RECENT_ACTIVITY_DAYS * MS_PER_DAY;
}

export function hasDeclaredLicense(repository: Pick<Repository, 'license'>): boolean {
  return normalizeLicense(repository.license) !== NO_LICENSE_SENTINEL;
}

const GROUP_FACT_IDS: Record<RepositoryHealthGroup, readonly RepositoryHealthFactId[]> = {
  activity: ['pushedAt', 'hasReleases', 'latestReleaseAt'],
  maintenance: ['archived', 'disabled', 'fork', 'template', 'license'],
  community: ['stars', 'forks', 'openIssues'],
  maturity: ['createdAt', 'ageDays', 'releaseCount', 'latestStableVersion'],
};

const FACT_KIND: Record<RepositoryHealthFactId, RepositoryHealthFact['kind']> = {
  pushedAt: 'date',
  hasReleases: 'boolean',
  latestReleaseAt: 'date',
  archived: 'boolean',
  disabled: 'boolean',
  fork: 'boolean',
  template: 'boolean',
  license: 'text',
  stars: 'count',
  forks: 'count',
  openIssues: 'count',
  createdAt: 'date',
  ageDays: 'duration',
  releaseCount: 'count',
  latestStableVersion: 'text',
};

const FACT_SOURCE: Record<RepositoryHealthFactId, RepositoryHealthFact['source']> = {
  pushedAt: 'repository',
  hasReleases: 'releases',
  latestReleaseAt: 'releases',
  archived: 'repository',
  disabled: 'repository',
  fork: 'repository',
  template: 'repository',
  license: 'repository',
  stars: 'repository',
  forks: 'repository',
  openIssues: 'repository',
  createdAt: 'repository',
  ageDays: 'repository',
  releaseCount: 'releases',
  latestStableVersion: 'releases',
};

const readFactValue = (
  snapshot: RepositoryHealthSnapshot,
  id: RepositoryHealthFactId,
): RepositoryHealthFact['value'] => {
  switch (id) {
    case 'hasReleases':
      return snapshot.releasesFetched ? snapshot.hasReleases : undefined;
    case 'license':
      if (snapshot.license === undefined) return undefined;
      return normalizeLicense(snapshot.license) === NO_LICENSE_SENTINEL ? null : snapshot.license;
    case 'template':
      return snapshot.isTemplate;
    default:
      return snapshot[id] as RepositoryHealthFact['value'];
  }
};

export function groupRepositoryHealthFacts(snapshot: RepositoryHealthSnapshot): RepositoryHealthGroupView[] {
  return (['activity', 'maintenance', 'community', 'maturity'] as const).map((group) => ({
    group,
    facts: GROUP_FACT_IDS[group].map((id) => ({
      id,
      group,
      kind: FACT_KIND[id],
      value: readFactValue(snapshot, id),
      source: FACT_SOURCE[id],
    })),
  }));
}
