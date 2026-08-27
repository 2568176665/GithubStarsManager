import { describe, expect, it } from 'vitest';
import { shouldPreserveLocalAIConfigs, shouldPreserveLocalCollection, shouldPreserveLocalVectorSearch, shouldQueueVectorSearchRepairPush, vectorSearchFingerprint } from './autoSync';

const canonical = {
  enabled: true,
  workerUrl: 'https://example.com/vectorize',
  authToken: 'worker-secret-token',
  embeddingConfigId: 'emb_test1',
  indexMode: 'readme',
  readmeMaxChars: 8000,
  searchThreshold: 0.42,
  searchTopK: 25,
  enableHyDE: false,
  enableReranking: true,
  embeddingFormatVersion: 2,
};

describe('vectorSearchFingerprint (loop-breaker)', () => {
  it('produces identical fingerprints for a backend payload and store config', () => {
    // Shape returned by GET /api/configs/vector-search (extra derived fields, different key order).
    const backendPayload = {
      enabled: true,
      workerUrl: 'https://example.com/vectorize',
      authToken: 'secret-secret',
      authTokenStatus: 'ok',
      embeddingConfigId: 'ep_test1',
      indexMode: 'readme',
      readmeMaxChars: 8000,
      searchThreshold: 0.42,
      searchTopK: 25,
      enableHyDE: false,
      enableReranking: true,
      embeddingFormatVersion: 2,
      status: { connected: true },
      lastSyncAt: '2026-08-06T00:00:00.000Z',
    };

    // Shape of the store config after mergeVectorSearchConfig (canonical key order, no extras).
    const storeConfig = {
      enabled: true,
      workerUrl: 'https://example.com/vectorize',
      authToken: 'secret-secret',
      embeddingConfigId: 'ep_test1',
      indexMode: 'readme',
      readmeMaxChars: 8000,
      searchThreshold: 0.42,
      searchTopK: 25,
      enableHyDE: false,
      enableReranking: true,
      embeddingFormatVersion: 2,
    };

    expect(vectorSearchFingerprint(backendPayload)).toBe(vectorSearchFingerprint(storeConfig));
  });

  it('is stable regardless of key ordering', () => {
    const a = vectorSearchFingerprint(canonical);
    const reordered = {
      enableReranking: canonical.enableReranking,
      enableHyDE: canonical.enableHyDE,
      searchThreshold: canonical.searchThreshold,
      searchTopK: canonical.searchTopK,
      embeddingFormatVersion: canonical.embeddingFormatVersion,
      readmeMaxChars: canonical.readmeMaxChars,
      enabled: canonical.enabled,
      workerUrl: canonical.workerUrl,
      authToken: canonical.authToken,
      embeddingConfigId: canonical.embeddingConfigId,
      indexMode: canonical.indexMode,
    };
    expect(a).toBe(vectorSearchFingerprint(reordered));
  });

  it('normalizes defaults so absent optional search fields do not drift', () => {
    const backendEmpty = vectorSearchFingerprint({ enabled: false, workerUrl: '', authToken: '', embeddingConfigId: '', indexMode: 'readme', readmeMaxChars: 6000 });
    const storeEmpty = vectorSearchFingerprint({ enabled: false, workerUrl: '', authToken: '', embeddingConfigId: '', indexMode: 'readme', readmeMaxChars: 6000, searchThreshold: 0.35, searchTopK: 30, enableHyDE: true, enableReranking: true, embeddingFormatVersion: null });
    expect(backendEmpty).toBe(storeEmpty);
  });
});

describe('shouldPreserveLocalVectorSearch (bootstrap guard)', () => {
  it('preserves a configured local config when the backend is empty on first sync', () => {
    expect(shouldPreserveLocalVectorSearch(
      { enabled: false, workerUrl: '', embeddingConfigId: '', indexMode: 'readme', readmeMaxChars: 6000 },
      { enabled: true, workerUrl: 'https://example.com', embeddingConfigId: 'emb_1' },
      true,
    )).toBe(true);
  });

  it('does not preserve when the local config is unconfigured', () => {
    expect(shouldPreserveLocalVectorSearch(
      { enabled: false, workerUrl: '', embeddingConfigId: '' },
      { enabled: false, workerUrl: '', embeddingConfigId: '' },
      true,
    )).toBe(false);
  });

  it('does not preserve when the backend already has a stored config (not first sync)', () => {
    expect(shouldPreserveLocalVectorSearch(
      { enabled: false, workerUrl: '', embeddingConfigId: '' },
      { enabled: true, workerUrl: 'https://example.com', embeddingConfigId: 'emb_1' },
      false,
    )).toBe(false);
    expect(shouldPreserveLocalVectorSearch(
      { enabled: false, workerUrl: 'https://example.com', embeddingConfigId: 'emb_1' },
      { enabled: true, workerUrl: '', embeddingConfigId: '' },
      true,
    )).toBe(false);
  });
});

describe('shouldQueueVectorSearchRepairPush (decrypt_failed / empty token)', () => {
  it('queues a repair push when the backend token is decrypt_failed and local has one', () => {
    expect(shouldQueueVectorSearchRepairPush(
      { authTokenStatus: 'decrypt_failed', authToken: '' },
      { authToken: 'local-token' },
    )).toBe(true);
  });

  it('queues a repair push when the backend token is empty but local has one', () => {
    expect(shouldQueueVectorSearchRepairPush(
      { authToken: '', authTokenStatus: 'empty' },
      { authToken: 'local-token' },
    )).toBe(true);
  });

  it('does not queue when the backend token is usable', () => {
    expect(shouldQueueVectorSearchRepairPush(
      { authToken: 'backend-token', authTokenStatus: 'ok' },
      { authToken: 'local-token' },
    )).toBe(false);
  });

  it('does not queue when the local client has no token to preserve', () => {
    expect(shouldQueueVectorSearchRepairPush(
      { authTokenStatus: 'decrypt_failed', authToken: '' },
      { authToken: '' },
    )).toBe(false);
  });

  it('converges after two pull cycles once the repair push lands', () => {
    const localConfig = { workerUrl: 'https://example.com', authToken: 'local-token', embeddingConfigId: 'emb_1' };

    // Cycle 1: backend token is unusable; repair push must be queued.
    const cycle1Backend = { workerUrl: 'https://example.com', authTokenStatus: 'decrypt_failed', authToken: '', embeddingConfigId: 'emb_1' };
    expect(shouldQueueVectorSearchRepairPush(cycle1Backend, localConfig)).toBe(true);
    // Effective store config now carries the preserved local token.
    const effectiveAfterRepair = { ...cycle1Backend, authToken: localConfig.authToken };

    // Cycle 2: the repair push landed, backend now returns the token.
    const cycle2Backend = { ...cycle1Backend, authTokenStatus: 'ok', authToken: localConfig.authToken };

    // The stored fingerprint (effective config, cycle 1) must match the backend
    // payload (cycle 2) so the second poll detects no change.
    expect(vectorSearchFingerprint(effectiveAfterRepair)).toBe(vectorSearchFingerprint(cycle2Backend));
  });
});

describe('shouldPreserveLocalAIConfigs (bootstrap guard)', () => {
  it('preserves local AI configs when D1 is empty on first sync', () => {
    expect(shouldPreserveLocalAIConfigs([], [{ id: 'ai-1', apiKey: 'secret' }], true)).toBe(true);
  });

  it('accepts an empty backend after the first sync', () => {
    expect(shouldPreserveLocalAIConfigs([], [{ id: 'ai-1', apiKey: 'secret' }], false)).toBe(false);
  });

  it('does not preserve when there are no local AI configs', () => {
    expect(shouldPreserveLocalAIConfigs([], [], true)).toBe(false);
  });
});

describe('shouldPreserveLocalCollection (D1 bootstrap guard)', () => {
  it('preserves local data when the first D1 pull is empty', () => {
    expect(shouldPreserveLocalCollection([{ id: 1 }], [{ id: 2 }], true)).toBe(false);
    expect(shouldPreserveLocalCollection([], [{ id: 2 }], true)).toBe(true);
  });

  it('accepts an empty D1 collection after the initial synchronization', () => {
    expect(shouldPreserveLocalCollection([], [{ id: 2 }], false)).toBe(false);
    expect(shouldPreserveLocalCollection([], [], true)).toBe(false);
  });
});
