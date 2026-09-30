import { describe, expect, it } from 'vitest';
import { parseRepositoryReferences } from './batchStarImport';

describe('parseRepositoryReferences', () => {
  it('extracts GitHub URLs, Markdown links and plain owner/repo references', () => {
    const result = parseRepositoryReferences([
      'https://github.com/Owner/First.git',
      '[second repo](https://github.com/owner/second/issues/3)',
      'owner/third',
    ].join('\n'));

    expect(result.candidates.map(candidate => candidate.fullName)).toEqual([
      'Owner/First',
      'owner/second',
      'owner/third',
    ]);
    expect(result.invalid).toEqual([]);
  });

  it('extracts repository references from GitHub API JSON and removes case-insensitive duplicates', () => {
    const result = parseRepositoryReferences(JSON.stringify({
      items: [
        { full_name: 'owner/first', html_url: 'https://github.com/owner/first' },
        { owner: { login: 'Owner' }, name: 'First' },
        { repository: 'https://github.com/owner/second' },
      ],
    }));

    expect(result.candidates.map(candidate => candidate.fullName)).toEqual(['owner/first', 'owner/second']);
    expect(result.duplicates).toEqual(['Owner/First']);
  });

  it('reports owner-only links and malformed repository paths', () => {
    const result = parseRepositoryReferences('https://github.com/owner\nbad!/repo');

    expect(result.candidates).toEqual([]);
    expect(result.invalid.map(issue => issue.reason)).toContain('链接没有仓库名');
    expect(result.invalid.map(issue => issue.reason)).toContain('仓库路径格式无效');
  });

  it('ignores unsupported hosts and unrelated plain text', () => {
    const result = parseRepositoryReferences('https://gitlab.com/owner/project\nhello world');

    expect(result).toEqual({ candidates: [], duplicates: [], invalid: [] });
  });
});
