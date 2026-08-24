import type { DiscoveryAnalysisData, DiscoveryAnalysisRecord } from '../services/discoveryAnalysisStorage';

const timestampOf = (data?: DiscoveryAnalysisData): number => {
  const timestamp = data?.analyzed_at ? Date.parse(data.analyzed_at) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

/** Merge cross-origin discovery analysis snapshots, preferring the newer result. */
export function mergeDiscoveryAnalyses(
  backendAnalyses: DiscoveryAnalysisRecord,
  localAnalyses: DiscoveryAnalysisRecord,
): DiscoveryAnalysisRecord {
  const merged: DiscoveryAnalysisRecord = { ...backendAnalyses };
  for (const [repoId, local] of Object.entries(localAnalyses)) {
    const remote = merged[repoId];
    if (!remote || timestampOf(local) >= timestampOf(remote)) {
      merged[repoId] = local;
    }
  }
  return merged;
}

export function analysesMapToRecord(analyses: Map<number, DiscoveryAnalysisData>): DiscoveryAnalysisRecord {
  return Object.fromEntries([...analyses.entries()].map(([repoId, data]) => [String(repoId), data]));
}
