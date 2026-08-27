import type { AIConfig } from '../types';

export function hasUsableAIConfig(config?: AIConfig | null): boolean {
  if (!config?.baseUrl || !config.model) return false;
  return !!config.apiKey && config.apiKeyStatus !== 'decrypt_failed' && config.apiKeyStatus !== 'empty';
}
