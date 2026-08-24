import { describe, expect, it } from 'vitest';
import { mergeDiscoveryAnalyses } from './discoveryAnalysisMerge';

describe('mergeDiscoveryAnalyses', () => {
  it('keeps the newer local analysis when the backend has an older snapshot', () => {
    const merged = mergeDiscoveryAnalyses(
      { '1': { ai_summary: 'old', analyzed_at: '2026-08-19T00:00:00.000Z' } },
      { '1': { ai_summary: 'new', analyzed_at: '2026-08-20T00:00:00.000Z' } },
    );

    expect(merged['1'].ai_summary).toBe('new');
  });

  it('preserves backend analyses missing from local storage', () => {
    const merged = mergeDiscoveryAnalyses(
      { '1': { ai_summary: 'remote', analyzed_at: '2026-08-20T00:00:00.000Z' } },
      {},
    );

    expect(merged['1'].ai_summary).toBe('remote');
  });
});
