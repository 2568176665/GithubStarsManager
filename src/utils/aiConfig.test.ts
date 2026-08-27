import { describe, expect, it } from 'vitest';
import type { AIConfig } from '../types';

import { hasUsableAIConfig, resolveActiveAIConfig } from './aiConfig';

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

describe('resolveActiveAIConfig', () => {
  const first = config({ id: 'first' });
  const second = config({ id: 'second' });

  it('preserves an active config that is still present', () => {
    expect(resolveActiveAIConfig([first, second], 'second')).toBe(second);
  });

  it('falls back to the first config when the active id is empty or stale', () => {
    expect(resolveActiveAIConfig([first, second], null)).toBe(first);
    expect(resolveActiveAIConfig([first, second], 'missing')).toBe(first);
  });

  it('returns null when no configs exist', () => {
    expect(resolveActiveAIConfig([], null)).toBeNull();
  });
});
