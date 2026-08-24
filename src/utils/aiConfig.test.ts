import { describe, expect, it, vi } from 'vitest';
import type { AIConfig } from '../types';

const backend = vi.hoisted(() => ({ isWorkerEnvMode: false }));
vi.mock('../services/backendAdapter', () => ({ backend }));

import { hasUsableAIConfig } from './aiConfig';

const config = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: 'local',
  name: 'Local',
  baseUrl: 'https://example.test/v1',
  apiKey: 'secret',
  model: 'model',
  isActive: true,
  apiKeyStatus: 'ok',
  ...overrides,
});

describe('hasUsableAIConfig', () => {
  it('allows Worker ENV configs without exposing an API key', () => {
    backend.isWorkerEnvMode = true;
    expect(hasUsableAIConfig(config({ id: 'worker-env-ai', apiKey: '', apiKeyStatus: 'env' }))).toBe(true);
  });

  it('rejects an incomplete local config', () => {
    backend.isWorkerEnvMode = false;
    expect(hasUsableAIConfig(config({ apiKey: '', apiKeyStatus: 'empty' }))).toBe(false);
  });

  it('accepts a complete local config', () => {
    backend.isWorkerEnvMode = false;
    expect(hasUsableAIConfig(config())).toBe(true);
  });
});
