export interface RepositoryReference {
  owner: string;
  name: string;
  fullName: string;
  source: 'url' | 'text';
}

export interface RepositoryReferenceIssue {
  value: string;
  reason: string;
}

export interface RepositoryReferenceParseResult {
  candidates: RepositoryReference[];
  duplicates: string[];
  invalid: RepositoryReferenceIssue[];
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const GITHUB_URL_PATTERN = /https?:\/\/(?:www\.)?github\.com\/([^\s/?#]+)(?:\/([^\s/?#]+))?/gi;
const SLUG_PATTERN = /(?<![A-Za-z0-9_.-])([^\s/]+)\/([^\s/?#]+)/g;

const cleanPathPart = (value: string): string => value.replace(/[.,;:?)\]}>'"`]+$/g, '').replace(/\.git$/i, '');

const isValidRepository = (owner: string, name: string): boolean =>
  OWNER_PATTERN.test(owner) && REPOSITORY_PATTERN.test(name) && name !== '.' && name !== '..';

/** 从 JSON 的常见 GitHub 仓库字段中提取仓库引用，避免扫描描述文本里的普通斜杠。 */
const collectJsonReferences = (value: unknown, output: string[]): void => {
  if (Array.isArray(value)) {
    value.forEach(item => collectJsonReferences(item, output));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const ownerValue = record.owner;
  const owner = typeof ownerValue === 'string'
    ? ownerValue
    : ownerValue && typeof ownerValue === 'object' && typeof (ownerValue as Record<string, unknown>).login === 'string'
      ? (ownerValue as { login: string }).login
      : undefined;

  const fullName = typeof record.full_name === 'string'
    ? record.full_name
    : owner && typeof record.name === 'string'
      ? `${owner}/${record.name}`
      : undefined;
  if (fullName) output.push(fullName);

  for (const [key, child] of Object.entries(record)) {
    if (key === 'full_name' || key === 'name') continue;
    if (!fullName && ['url', 'html_url', 'repository', 'repo'].includes(key) && typeof child === 'string') output.push(child);
    if (child && typeof child === 'object') collectJsonReferences(child, output);
  }
};

/** 解析 GitHub 仓库 URL、Markdown 链接、owner/repo 文本及常见 JSON 仓库对象。 */
export const parseRepositoryReferences = (input: string): RepositoryReferenceParseResult => {
  const candidates: RepositoryReference[] = [];
  const duplicates: string[] = [];
  const invalid: RepositoryReferenceIssue[] = [];
  const seen = new Set<string>();
  const references: Array<{ value: string; source: RepositoryReference['source'] }> = [];

  const addTextReferences = (text: string) => {
    GITHUB_URL_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(GITHUB_URL_PATTERN)) {
      const owner = cleanPathPart(match[1] || '');
      const name = cleanPathPart(match[2] || '');
      if (!name) {
        invalid.push({ value: match[0], reason: '链接没有仓库名' });
      } else {
        references.push({ value: `${owner}/${name}`, source: 'url' });
      }
    }

    // URL 已单独解析；移除它们后再找裸 owner/repo，防止重复识别路径片段。
    const withoutUrls = text.replace(/https?:\/\/[^\s)\]>]+/gi, ' ');
    SLUG_PATTERN.lastIndex = 0;
    for (const match of withoutUrls.matchAll(SLUG_PATTERN)) {
      references.push({ value: `${match[1]}/${match[2]}`, source: 'text' });
    }
  };

  let jsonParsed = false;
  try {
    const jsonValue: unknown = JSON.parse(input);
    const jsonReferences: string[] = [];
    collectJsonReferences(jsonValue, jsonReferences);
    if (jsonReferences.length > 0) {
      jsonParsed = true;
      jsonReferences.forEach(value => addTextReferences(value));
    }
  } catch {
    // 普通文本和 Markdown 走下方的轻量解析。
  }
  if (!jsonParsed) addTextReferences(input);

  for (const reference of references) {
    const [rawOwner, ...rawNameParts] = reference.value.split('/');
    const owner = cleanPathPart(rawOwner || '').trim();
    const name = cleanPathPart(rawNameParts.join('/')).trim();
    if (!isValidRepository(owner, name)) {
      invalid.push({ value: reference.value, reason: '仓库路径格式无效' });
      continue;
    }

    const fullName = `${owner}/${name}`;
    const key = fullName.toLocaleLowerCase();
    if (seen.has(key)) {
      duplicates.push(fullName);
      continue;
    }
    seen.add(key);
    candidates.push({ owner, name, fullName, source: reference.source });
  }

  return { candidates, duplicates, invalid };
};
