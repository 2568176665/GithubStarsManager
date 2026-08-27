import { describe, expect, it } from 'vitest';
import type { AIConfig } from '../types';

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
  it('rejects an incomplete local config', () => {
    expect(hasUsableAIConfig(config({ apiKey: '', apiKeyStatus: 'empty' }))).toBe(false);
  });

  it('accepts a complete local config', () => {
    expect(hasUsableAIConfig(config())).toBe(true);
  });
});
