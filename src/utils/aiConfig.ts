import type { AIConfig } from '../types';
import { backend } from '../services/backendAdapter';

/** Worker ENV AI intentionally keeps the API key out of the browser. */
export function isWorkerManagedAIConfig(config?: Pick<AIConfig, 'id' | 'apiKeyStatus'> | null): boolean {
  return backend.isWorkerEnvMode && config?.id === 'worker-env-ai';
}

export function hasUsableAIConfig(config?: AIConfig | null): boolean {
  if (!config?.baseUrl || !config.model) return false;
  if (isWorkerManagedAIConfig(config)) return true;
  return !!config.apiKey && config.apiKeyStatus !== 'decrypt_failed' && config.apiKeyStatus !== 'empty';
}
