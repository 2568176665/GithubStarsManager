import type { AIConfig } from '../types';

export function resolveActiveAIConfig(
  aiConfigs: AIConfig[],
  activeAIConfig?: string | null,
): AIConfig | null {
  return aiConfigs.find((config) => config.id === activeAIConfig) ?? aiConfigs[0] ?? null;
}

export function hasUsableAIConfig(config?: AIConfig | null): boolean {
  if (!config?.baseUrl || !config.model) return false;
  return !!config.apiKey && config.apiKeyStatus !== 'decrypt_failed' && config.apiKeyStatus !== 'empty';
}
