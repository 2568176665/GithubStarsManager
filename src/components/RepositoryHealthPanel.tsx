import React, { useMemo } from 'react';
import { AlertTriangle, Archive, Ban, PackageOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type { Release, Repository } from '../types';
import type {
  RepositoryHealthFact,
  RepositoryHealthFactId,
  RepositoryHealthGroup,
  RepositoryHealthSignalId,
} from '../types/health';
import { deriveRepositoryHealthSnapshot, groupRepositoryHealthFacts } from '../utils/repositoryHealth';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Badge } from './ui/badge';

interface RepositoryHealthPanelProps {
  repository: Repository;
  /** 加载中或加载失败时传 undefined，避免把“尚未取得数据”误报为无 Release。 */
  releases?: Release[];
  language: 'zh' | 'en';
}

const groupLabels: Record<RepositoryHealthGroup, [string, string]> = {
  activity: ['活跃度', 'Activity'],
  maintenance: ['维护状态', 'Maintenance'],
  community: ['社区信息', 'Community'],
  maturity: ['成熟度', 'Maturity'],
};

const factLabels: Record<RepositoryHealthFactId, [string, string]> = {
  pushedAt: ['最近提交', 'Last push'],
  hasReleases: ['有 Release', 'Has releases'],
  latestReleaseAt: ['最近 Release', 'Latest release'],
  archived: ['已归档', 'Archived'],
  disabled: ['已禁用', 'Disabled'],
  fork: ['Fork 仓库', 'Fork'],
  template: ['模板仓库', 'Template'],
  license: ['许可证', 'License'],
  stars: ['星标数', 'Stars'],
  forks: ['Fork 数', 'Forks'],
  openIssues: ['开放 Issue', 'Open issues'],
  createdAt: ['创建时间', 'Created'],
  ageDays: ['仓库年龄', 'Repository age'],
  releaseCount: ['Release 数', 'Releases'],
  latestStableVersion: ['最新稳定版本', 'Latest stable version'],
};

const signalLabels: Record<RepositoryHealthSignalId, [string, string]> = {
  archived: ['已归档', 'Archived'],
  disabled: ['已禁用', 'Disabled'],
  'no-releases': ['暂无 Release', 'No releases'],
  'no-recent-activity': ['近一年无提交', 'No pushes in 12 months'],
};

const signalIcons: Record<RepositoryHealthSignalId, React.ComponentType<{ className?: string }>> = {
  archived: Archive,
  disabled: Ban,
  'no-releases': PackageOpen,
  'no-recent-activity': AlertTriangle,
};

const translate = (language: 'zh' | 'en', [zh, en]: [string, string]): string => (
  language === 'zh' ? zh : en
);

const formatFactValue = (fact: RepositoryHealthFact, language: 'zh' | 'en'): { text: string; muted: boolean; title?: string } => {
  if (fact.value === undefined) {
    return { text: language === 'zh' ? '未知' : 'Unknown', muted: true };
  }
  if (fact.value === null) {
    return { text: language === 'zh' ? '无' : 'None', muted: true };
  }
  if (fact.kind === 'boolean') {
    return {
      text: fact.value ? (language === 'zh' ? '是' : 'Yes') : (language === 'zh' ? '否' : 'No'),
      muted: !fact.value,
    };
  }
  if (fact.kind === 'count') {
    return { text: Number(fact.value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US'), muted: false };
  }
  if (fact.kind === 'duration') {
    const days = Number(fact.value);
    const years = Math.round((days / 365.25) * 10) / 10;
    return {
      text: language === 'zh' ? `${days.toLocaleString('zh-CN')} 天（约 ${years} 年）` : `${days.toLocaleString('en-US')} days (about ${years} years)`,
      muted: false,
    };
  }
  if (fact.kind === 'date') {
    const raw = String(fact.value);
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp)) return { text: raw, muted: false };
    return {
      text: formatDistanceToNow(timestamp, { addSuffix: true, locale: language === 'zh' ? zhCN : undefined }),
      title: new Date(timestamp).toISOString().slice(0, 10),
      muted: false,
    };
  }
  return { text: String(fact.value), muted: false };
};

export const RepositoryHealthPanel: React.FC<RepositoryHealthPanelProps> = ({ repository, releases, language }) => {
  const { snapshot, groups } = useMemo(() => {
    const snapshot = deriveRepositoryHealthSnapshot(repository, releases);
    return { snapshot, groups: groupRepositoryHealthFacts(snapshot) };
  }, [repository, releases]);

  const title = language === 'zh' ? '仓库健康事实' : 'Repository health facts';

  return (
    <section className="mb-3 rounded-md border border-border bg-muted/20" aria-label={title}>
      <Accordion type="single" collapsible>
        <AccordionItem value="facts" className="border-0">
          <AccordionTrigger className="px-3 py-2 text-xs hover:no-underline">
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="font-semibold">{title}</span>
              {snapshot.signals.map((signal) => {
                const Icon = signalIcons[signal.id];
                return (
                  <Badge key={signal.id} variant="outline" className="gap-1 text-[11px] font-normal">
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {translate(language, signalLabels[signal.id])}
                  </Badge>
                );
              })}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map(({ group, facts }) => (
                <div key={group}>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {translate(language, groupLabels[group])}
                  </p>
                  <dl className="space-y-0.5">
                    {facts.map((fact) => {
                      const value = formatFactValue(fact, language);
                      return (
                        <div key={fact.id} className="flex items-baseline justify-between gap-2 text-xs">
                          <dt className="truncate text-muted-foreground">{translate(language, factLabels[fact.id])}</dt>
                          <dd className={`shrink-0 text-right ${value.muted ? 'text-muted-foreground' : ''}`} title={value.title}>
                            {value.text}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {language === 'zh'
                ? '这里展示可验证事实，不计算整体健康分数。'
                : 'These are verifiable facts; no overall health score is calculated.'}
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
};

export default RepositoryHealthPanel;
