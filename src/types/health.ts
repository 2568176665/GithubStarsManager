/**
 * Repository Health 的客观事实模型。
 *
 * 这里只表达可验证的仓库字段和本地 Release 事实，不计算健康总分，
 * 也不把缺失字段猜测成 false。
 */

export type RepositoryHealthGroup = 'activity' | 'maintenance' | 'community' | 'maturity';

export type RepositoryHealthFactSource = 'repository' | 'releases';

export type RepositoryHealthFactKind = 'boolean' | 'date' | 'count' | 'text' | 'duration';

export type RepositoryHealthFactId =
  | 'pushedAt'
  | 'hasReleases'
  | 'latestReleaseAt'
  | 'archived'
  | 'disabled'
  | 'fork'
  | 'template'
  | 'license'
  | 'stars'
  | 'forks'
  | 'openIssues'
  | 'createdAt'
  | 'ageDays'
  | 'releaseCount'
  | 'latestStableVersion';

export interface RepositoryHealthFact {
  id: RepositoryHealthFactId;
  group: RepositoryHealthGroup;
  kind: RepositoryHealthFactKind;
  /** `undefined` 表示未知，`null` 表示已知但为空。 */
  value: boolean | number | string | null | undefined;
  source: RepositoryHealthFactSource;
}

export type RepositoryHealthSignalId = 'archived' | 'disabled' | 'no-releases' | 'no-recent-activity';

export interface RepositoryHealthSignal {
  id: RepositoryHealthSignalId;
  since: number | null;
  detail?: string | null;
}

export interface RepositoryHealthSnapshot {
  archived: boolean | undefined;
  disabled: boolean | undefined;
  fork: boolean | undefined;
  isTemplate: boolean | undefined;
  createdAt: string;
  pushedAt: string | null;
  hasReleases: boolean;
  releasesFetched: boolean;
  latestReleaseAt: string | null;
  releaseCount: number;
  latestStableVersion: string | null;
  stars: number;
  forks: number;
  openIssues: number | undefined;
  license: string | null | undefined;
  ageDays: number | null;
  daysSinceLastPush: number | null;
  signals: RepositoryHealthSignal[];
}

export interface RepositoryHealthGroupView {
  group: RepositoryHealthGroup;
  facts: RepositoryHealthFact[];
}
