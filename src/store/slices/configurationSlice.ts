
import type { AppStoreSlice } from '../types';
import { mergeVectorSearchConfig, normalizeMcpConfig } from '../schema';
import { resolveActiveAIConfig } from '../../utils/aiConfig';

export const createConfigurationSlice: AppStoreSlice<Pick<import('../types').AppActions,
  | 'addAIConfig'
  | 'updateAIConfig'
  | 'deleteAIConfig'
  | 'setActiveAIConfig'
  | 'setAIConfigs'
  | 'setRepositoryChatSettings'
  | 'addWebDAVConfig'
  | 'updateWebDAVConfig'
  | 'deleteWebDAVConfig'
  | 'setActiveWebDAVConfig'
  | 'setWebDAVConfigs'
  | 'setLastBackup'
  | 'addEmbeddingConfig'
  | 'updateEmbeddingConfig'
  | 'deleteEmbeddingConfig'
  | 'setActiveEmbeddingConfig'
  | 'setEmbeddingConfigs'
  | 'setVectorSearchConfig'
  | 'setVectorSearchStatus'
  | 'setVectorIndexingState'
  | 'setMcpConfig'
>> = (set) => ({
      // AI actions
      addAIConfig: (config) => set((state) => {
        const aiConfigs = [...state.aiConfigs, config];
        return {
          aiConfigs,
          activeAIConfig: resolveActiveAIConfig(aiConfigs, state.activeAIConfig)?.id ?? null,
        };
      }),
      updateAIConfig: (id, updates) => set((state) => ({
        aiConfigs: state.aiConfigs.map(config =>
          config.id === id ? { ...config, ...updates } : config
        )
      })),
      deleteAIConfig: (id) => set((state) => {
        const aiConfigs = state.aiConfigs.filter(config => config.id !== id);
        return {
          aiConfigs,
          activeAIConfig: resolveActiveAIConfig(aiConfigs, state.activeAIConfig)?.id ?? null,
        };
      }),
      setActiveAIConfig: (activeAIConfig) => set((state) => ({
        activeAIConfig: resolveActiveAIConfig(state.aiConfigs, activeAIConfig)?.id ?? null,
      })),
      setAIConfigs: (aiConfigs) => set((state) => ({
        aiConfigs,
        activeAIConfig: resolveActiveAIConfig(aiConfigs, state.activeAIConfig)?.id ?? null,
      })),
      setRepositoryChatSettings: (settings) => set((state) => ({
        repositoryChatSettings: { ...state.repositoryChatSettings, ...settings },
      })),

      // WebDAV actions
      addWebDAVConfig: (config) => set((state) => ({
        webdavConfigs: [...state.webdavConfigs, config]
      })),
      updateWebDAVConfig: (id, updates) => set((state) => ({
        webdavConfigs: state.webdavConfigs.map(config =>
          config.id === id ? { ...config, ...updates } : config
        )
      })),
      deleteWebDAVConfig: (id) => set((state) => ({
        webdavConfigs: state.webdavConfigs.filter(config => config.id !== id),
        activeWebDAVConfig: state.activeWebDAVConfig === id ? null : state.activeWebDAVConfig
      })),
      setActiveWebDAVConfig: (activeWebDAVConfig) => set({ activeWebDAVConfig }),
      setWebDAVConfigs: (webdavConfigs) => set({ webdavConfigs }),
      setLastBackup: (lastBackup) => set({ lastBackup }),

      // Embedding actions
      addEmbeddingConfig: (config) => set((state) => ({
        embeddingConfigs: [...state.embeddingConfigs, config]
      })),
      updateEmbeddingConfig: (id, updates) => set((state) => ({
        embeddingConfigs: state.embeddingConfigs.map(config =>
          config.id === id ? { ...config, ...updates } : config
        )
      })),
      deleteEmbeddingConfig: (id) => set((state) => ({
        embeddingConfigs: state.embeddingConfigs.filter(config => config.id !== id),
        activeEmbeddingConfig: state.activeEmbeddingConfig === id ? null : state.activeEmbeddingConfig,
        vectorSearchConfig: state.vectorSearchConfig.embeddingConfigId === id
          ? { ...state.vectorSearchConfig, embeddingConfigId: '', enabled: false }
          : state.vectorSearchConfig,
      })),
      setActiveEmbeddingConfig: (activeEmbeddingConfig) => set({ activeEmbeddingConfig }),
      setEmbeddingConfigs: (embeddingConfigs) => set((state) => {
        const ids = new Set(embeddingConfigs.map(config => config.id));
        const activeEmbeddingConfig = state.activeEmbeddingConfig && ids.has(state.activeEmbeddingConfig)
          ? state.activeEmbeddingConfig
          : null;
        const vectorSearchConfig = ids.has(state.vectorSearchConfig.embeddingConfigId)
          ? state.vectorSearchConfig
          : { ...state.vectorSearchConfig, embeddingConfigId: '', enabled: false };
        return { embeddingConfigs, activeEmbeddingConfig, vectorSearchConfig };
      }),

      // Vector Search actions
      setVectorSearchConfig: (config) => set((state) => ({
        vectorSearchConfig: mergeVectorSearchConfig(state.vectorSearchConfig, config)
      })),
      setVectorSearchStatus: (status) => set({ vectorSearchStatus: status }),
      setMcpConfig: (config) =>
        set((state) => ({
          mcpConfig: normalizeMcpConfig({ ...state.mcpConfig, ...config }),
        })),
      setVectorIndexingState: (indexingState) => set((state) => ({
        vectorIndexingState: { ...state.vectorIndexingState, ...indexingState }
      })),

});
