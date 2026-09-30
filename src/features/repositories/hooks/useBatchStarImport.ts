import { useCallback, useState } from 'react';
import type { Repository } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { createGitHubApiService } from '../../../services/githubApiFactory';
import { translateBatch } from '../../../services/translateService';
import { parseRepositoryReferences, type RepositoryReferenceIssue } from '../application/batchStarImport';

export const BATCH_STAR_IMPORT_LIMIT = 50;

export interface BatchStarImportRow {
  fullName: string;
  source: 'url' | 'text';
  status: 'resolving' | 'ready' | 'starred' | 'resolve-error' | 'success' | 'star-error';
  repository?: Repository;
  isStarred: boolean | null;
  selected: boolean;
  error?: string;
  translatedDescription?: string;
}

interface BatchStarImportResult {
  succeeded: number;
  failed: number;
}

export const useBatchStarImport = (onSynced?: () => Promise<void>) => {
  const githubToken = useAppStore(state => state.githubToken);
  const language = useAppStore(state => state.language);
  const [rows, setRows] = useState<BatchStarImportRow[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<RepositoryReferenceIssue[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [isStarring, setIsStarring] = useState(false);
  const [starProgress, setStarProgress] = useState({ done: 0, total: 0 });
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setRows([]);
    setDuplicates([]);
    setInvalid([]);
    setIsResolving(false);
    setIsStarring(false);
    setStarProgress({ done: 0, total: 0 });
    setTranslationError(null);
    setSyncError(null);
  }, []);

  const resolveInput = useCallback(async (input: string, translateDescriptions: boolean) => {
    if (!githubToken || isResolving || isStarring) return;
    const parsed = parseRepositoryReferences(input);
    const references = parsed.candidates.slice(0, BATCH_STAR_IMPORT_LIMIT);
    const overflow = parsed.candidates.slice(BATCH_STAR_IMPORT_LIMIT).map(reference => ({
      value: reference.fullName,
      reason: `超过每批 ${BATCH_STAR_IMPORT_LIMIT} 个仓库的上限`,
    }));
    setDuplicates(parsed.duplicates);
    setInvalid([...parsed.invalid, ...overflow]);
    setTranslationError(null);
    setSyncError(null);
    setStarProgress({ done: 0, total: 0 });

    if (!references.length) {
      setRows([]);
      return;
    }

    setRows(references.map(reference => ({
      fullName: reference.fullName,
      source: reference.source,
      status: 'resolving',
      isStarred: null,
      selected: false,
    })));
    setIsResolving(true);

    const api = createGitHubApiService(githubToken);
    let nextIndex = 0;
    const resolvedRows: Array<BatchStarImportRow | null> = Array(references.length).fill(null);
    const canonicalNames = new Set<string>();
    const workerCount = Math.min(4, references.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < references.length) {
        const index = nextIndex++;
        const reference = references[index];
        try {
          const repository = await api.getRepositoryForImport(reference.owner, reference.name);
          const isStarred = await api.isRepositoryStarred(repository.owner.login, repository.name);
          const fullName = repository.full_name || reference.fullName;
          const key = fullName.toLocaleLowerCase();
          if (canonicalNames.has(key)) {
            setDuplicates(previous => [...previous, fullName]);
            continue;
          }
          canonicalNames.add(key);
          resolvedRows[index] = {
            fullName,
            source: reference.source,
            repository,
            status: isStarred ? 'starred' : 'ready',
            isStarred,
            selected: !isStarred,
          };
        } catch (error) {
          resolvedRows[index] = {
            fullName: reference.fullName,
            source: reference.source,
            status: 'resolve-error',
            isStarred: null,
            selected: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    });

    try {
      await Promise.all(workers);
      let nextRows = resolvedRows.filter((row): row is BatchStarImportRow => row !== null);
      if (translateDescriptions) {
        const translationRows = nextRows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => Boolean(row.repository?.description?.trim()));
        try {
          const translated = await translateBatch(
            translationRows.map(({ row }) => row.repository!.description!),
            language === 'zh' ? 'zh' : 'en',
            undefined,
            undefined,
            'plain',
          );
          const translationsByIndex = new Map(
            translationRows.map(({ index }, translatedIndex) => [index, translated[translatedIndex]?.translatedText])
          );
          nextRows = nextRows.map((row, index) => ({
            ...row,
            translatedDescription: translationsByIndex.get(index) || undefined,
          }));
        } catch (error) {
          setTranslationError(error instanceof Error ? error.message : String(error));
        }
      }
      setRows(nextRows);
    } finally {
      setIsResolving(false);
    }
  }, [githubToken, isResolving, isStarring, language]);

  const toggleSelected = useCallback((fullName: string, selected: boolean) => {
    setRows(previous => previous.map(row =>
      row.fullName === fullName && (row.status === 'ready' || row.status === 'star-error') ? { ...row, selected } : row
    ));
  }, []);

  const selectAllReady = useCallback((selected: boolean) => {
    setRows(previous => previous.map(row =>
      row.status === 'ready' || row.status === 'star-error' ? { ...row, selected } : row
    ));
  }, []);

  const starSelected = useCallback(async (): Promise<BatchStarImportResult> => {
    if (!githubToken || isStarring || isResolving) return { succeeded: 0, failed: 0 };
    const selected = rows.filter(row => row.selected && row.isStarred === false && row.status !== 'success');
    if (!selected.length) return { succeeded: 0, failed: 0 };

    const api = createGitHubApiService(githubToken);
    setIsStarring(true);
    setStarProgress({ done: 0, total: selected.length });
    setSyncError(null);
    let succeeded = 0;
    let failed = 0;

    for (const row of selected) {
      const [owner, name] = row.fullName.split('/');
      try {
        await api.starRepository(owner, name);
        succeeded++;
        setRows(previous => previous.map(item => item.fullName === row.fullName
          ? { ...item, status: 'success', isStarred: true, selected: false, error: undefined }
          : item
        ));
      } catch (error) {
        failed++;
        setRows(previous => previous.map(item => item.fullName === row.fullName
          ? { ...item, status: 'star-error', error: error instanceof Error ? error.message : String(error) }
          : item
        ));
      } finally {
        setStarProgress(progress => ({ ...progress, done: progress.done + 1 }));
      }
    }

    if (succeeded && onSynced) {
      try {
        await onSynced();
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : String(error));
      }
    }
    setIsStarring(false);
    return { succeeded, failed };
  }, [githubToken, isStarring, isResolving, rows, onSynced]);

  return {
    rows,
    duplicates,
    invalid,
    isResolving,
    isStarring,
    starProgress,
    translationError,
    syncError,
    resolveInput,
    toggleSelected,
    selectAllReady,
    starSelected,
    reset,
  };
};
