import React, { useState, useMemo } from 'react';
import { Plus, Edit3, Trash2, Filter, ChevronDown, ChevronUp, X, Package, Lock, MonitorSmartphone } from 'lucide-react';
import { SiAndroid, SiApple, SiLinux } from '@icons-pack/react-simple-icons';
import { SiWindows } from './SiWindows';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { FilterModal } from './FilterModal';
import { AssetFilter } from '../types';
import { useDialog } from '../hooks/useDialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { getPlatformIcon } from './platformMeta';
import type { InstallablePlatform } from '../types/installableAsset';
import { BUILTIN_CURRENT_SYSTEM_FILTER_ID } from '../constants/builtinFilters';

// 图标映射。
// 存量数据里持久化的是 lucide 图标名（见 store/schema.ts PRESET_FILTER_ICONS），
// 渲染时按名 remap 到 Simple Icons 品牌字形；'Package'（源码预设）沿用 lucide。
const ICON_MAP: Record<string, React.ElementType> = {
  Monitor: SiWindows,
  Apple: SiApple,
  Smartphone: SiAndroid,
  Terminal: SiLinux,
  Package,
};

// 图标名称映射（基于 PRESET_FILTERS 的 id）
const PRESET_ICON_MAP: Record<string, string> = {
  'preset-windows': 'Monitor',
  'preset-macos': 'Apple',
  'preset-linux': 'Terminal',
  'preset-android': 'Smartphone',
  'preset-source': 'Package',
};

const getFilterRuleSummary = (filter: AssetFilter): string => [
  ...filter.keywords,
  ...(filter.excludeKeywords ?? []).map(keyword => `-${keyword}`),
  ...(filter.includeRepos ?? []).map(repository => `repo:${repository}`),
  ...(filter.alwaysExcludeRepos ?? []).map(repository => `!repo:${repository}`),
].join(', ');

interface AssetFilterManagerProps {
  selectedFilters: string[];
  onFilterToggle: (filterId: string) => void;
  onClearFilters: () => void;
  currentSystemFilter?: {
    id: typeof BUILTIN_CURRENT_SYSTEM_FILTER_ID;
    status: 'ready' | 'detecting-arch' | 'arch-unknown' | 'unsupported';
    platform: InstallablePlatform | null;
    label: string;
    matchCount?: number;
  };
}

export const AssetFilterManager: React.FC<AssetFilterManagerProps> = ({
  selectedFilters,
  onFilterToggle,
  onClearFilters,
  currentSystemFilter,
}) => {
  const { assetFilters, addAssetFilter, updateAssetFilter, deleteAssetFilter, language } = useAppStore(useShallow((state) => ({
    assetFilters: state.assetFilters,
    addAssetFilter: state.addAssetFilter,
    updateAssetFilter: state.updateAssetFilter,
    deleteAssetFilter: state.deleteAssetFilter,
    language: state.language,
  })));

  const { confirm } = useDialog();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<AssetFilter | undefined>();
  const [isExpanded, setIsExpanded] = useState(false);

  // 归一化 assetFilters：匹配预设标识的项设为 isPreset=true
  const normalizedFilters = useMemo(() => assetFilters.map(f => {
    const isPresetId = PRESET_ICON_MAP[f.id] !== undefined;
    if (isPresetId && !f.isPreset) {
      return { ...f, isPreset: true };
    }
    return f;
  }), [assetFilters]);

  // 分离预设筛选器和自定义筛选器
  const presetFilters = normalizedFilters.filter(f => f.isPreset);
  const customFilters = normalizedFilters.filter(f => !f.isPreset);

  const handleCreateFilter = () => {
    setEditingFilter(undefined);
    setIsModalOpen(true);
  };

  const handleEditFilter = (filter: AssetFilter) => {
    setEditingFilter(filter);
    setIsModalOpen(true);
  };

  const handleDeleteFilter = async (filterId: string) => {
    const confirmed = await confirm(
      t('删除过滤器', 'Delete Filter'),
      language === 'zh' ? '确定要删除这个过滤器吗？' : 'Are you sure you want to delete this filter?',
      { type: 'danger', confirmText: t('删除', 'Delete') }
    );

    if (!confirmed) return;

    deleteAssetFilter(filterId);
    if (selectedFilters.includes(filterId)) {
      onFilterToggle(filterId);
    }
  };

  const handleSaveFilter = (filter: AssetFilter) => {
    if (editingFilter) {
      updateAssetFilter(filter.id, filter);
    } else {
      addAssetFilter(filter);
    }
  };

  const handlePresetToggle = (presetId: string) => {
    onFilterToggle(presetId);
  };

  const t = (zh: string, en: string) => language === 'zh' ? zh : en;
  const CurrentSystemIcon = currentSystemFilter?.platform
    ? getPlatformIcon(currentSystemFilter.platform)
    : MonitorSmartphone;
  const currentSystemSelected = !!currentSystemFilter
    && selectedFilters.includes(currentSystemFilter.id);
  const currentSystemUnsupported = currentSystemFilter?.status === 'unsupported';

  return (
    <div className="space-y-3">
      {/* Compact Header with Toggle */}
      <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-2 px-3 py-2 bg-muted dark:bg-muted/40 rounded-lg hover:bg-accent dark:hover:bg-accent transition-all group"
          title={isExpanded ? t('收起过滤器', 'Collapse filters') : t('展开过滤器', 'Expand filters')}
          aria-expanded={isExpanded}
          aria-controls="asset-filter-panel"
        >
          <Filter className={`w-4 h-4 text-muted-foreground dark:text-muted-foreground transition-transform ${
            isExpanded ? 'text-primary dark:text-primary' : ''
          }`} aria-hidden="true" />
          <span className="text-sm font-medium text-foreground dark:text-muted-foreground">
            {t('过滤器', 'Filters')}
          </span>
          {selectedFilters.length > 0 && (
            <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded-full">
              {selectedFilters.length}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground dark:text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground dark:text-muted-foreground" aria-hidden="true" />
          )}
        </Button>

        <div className="flex items-center space-x-2">
          {selectedFilters.length > 0 && (
            <Button
              variant="ghost"
              onClick={onClearFilters}
              className="flex items-center space-x-1 px-2 py-1.5 text-xs text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-accent rounded-lg transition-colors"
              title={t('清除所有筛选', 'Clear all filters')}
              type="button"
              aria-label={t('清除所有筛选', 'Clear all filters')}
            >
              <X className="w-3 h-3" aria-hidden="true" />
              <span className="hidden sm:inline">{t('清除所有筛选', 'Clear all filters')}</span>
            </Button>
          )}
          <Button
            onClick={handleCreateFilter}
            className="flex items-center space-x-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
            title={t('新建过滤器', 'New Filter')}
            type="button"
            aria-label={t('新建过滤器', 'New Filter')}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('新建', 'New')}</span>
          </Button>
        </div>
      </div>

      {/* Expandable Content */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">
          <div id="asset-filter-panel" className="space-y-3">
          {/* 内置「当前系统」筛选：不可编辑，仅按检测结果过滤 */}
          {currentSystemFilter && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <Button
                variant="ghost"
                onClick={() => onFilterToggle(currentSystemFilter.id)}
                disabled={currentSystemUnsupported}
                className="h-auto min-h-0 flex-1 items-center justify-start gap-2 p-0 text-left"
                title={currentSystemUnsupported
                  ? t('当前设备不支持，已忽略', 'Not supported on this device; ignored')
                  : t(
                      `显示能在 ${currentSystemFilter.label} 上运行的资产，以及平台未确认的资产。依据文件名、同版本资产和仓库信息识别；卡片中可点「显示全部」查看其余资产。`,
                      `Shows assets that run on ${currentSystemFilter.label} plus assets whose platform is unverified, based on file names, sibling assets and repository info. Use "Show all" on a card to see the rest.`,
                    )}
                type="button"
                aria-pressed={currentSystemSelected}
              >
                <CurrentSystemIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-col items-start">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{t('当前系统', 'This device')}</span>
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] font-medium">
                      {t('内置', 'Built-in')}
                    </Badge>
                  </span>
                  <span className={`truncate text-xs ${currentSystemUnsupported ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {currentSystemUnsupported && currentSystemSelected
                      ? t('当前设备不支持，已忽略', 'Not supported on this device; ignored')
                      : currentSystemFilter.label}
                  </span>
                </span>
              </Button>
              {typeof currentSystemFilter.matchCount === 'number' && (
                <span className="flex-shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {currentSystemFilter.matchCount}
                </span>
              )}
              <span title={t('内置过滤器不可编辑', "Built-in filter can't be edited")}>
                <Lock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              </span>
            </div>
          )}

          {/* Preset Filters */}
          {presetFilters.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-2">
                {t('预设筛选器', 'Preset Filters')}
              </p>
              <div className="flex flex-wrap gap-2">
                {presetFilters.map(preset => {
                  const Icon = preset.icon ? ICON_MAP[preset.icon] : Filter;
                  const isSelected = selectedFilters.includes(preset.id);
                  return (
                    <div
                      key={preset.id}
                      className={`group flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                        isSelected
                          ? 'bg-primary border-transparent text-primary-foreground font-medium'
                          : 'bg-card border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <Button
                        variant="ghost"
                        onClick={() => handlePresetToggle(preset.id)}
                        className="h-auto min-h-0 flex items-center space-x-1.5 p-0"
                        title={[...preset.keywords, ...(preset.excludeKeywords ?? []).map(keyword => `-${keyword}`), ...(preset.includeRepos ?? [])].join(', ')}
                        type="button"
                        aria-pressed={isSelected}
                      >
                        {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
                        <span>{preset.name}</span>
                      </Button>

                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ml-1">
                        <Button
                          variant="ghost"
                          onClick={() => handleEditFilter(preset)}
                          className="h-6 w-6 rounded p-0 hover:bg-accent hover:text-accent-foreground transition-colors"
                          title={t('编辑', 'Edit')}
                          type="button"
                          aria-label={t('编辑', 'Edit')}
                        >
                          <Edit3 className="w-3 h-3" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Filters */}
          {customFilters.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-2">
                {t('自定义筛选器', 'Custom Filters')}
              </p>
              <div className="flex flex-wrap gap-2">
                {customFilters.map(filter => (
                  <div
                    key={filter.id}
                    className={`group flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors ${
                      selectedFilters.includes(filter.id)
                        ? 'bg-primary border-transparent text-primary-foreground font-medium'
                        : 'bg-muted border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => onFilterToggle(filter.id)}
                      className="h-auto min-h-0 flex flex-1 items-center justify-start space-x-2 p-0"
                      aria-pressed={selectedFilters.includes(filter.id)}
                      aria-label={`${filter.name}${getFilterRuleSummary(filter) ? ` (${getFilterRuleSummary(filter)})` : ''}`}
                      title={`${filter.name}${getFilterRuleSummary(filter) ? ` (${getFilterRuleSummary(filter)})` : ''}`}
                      type="button"
                    >
                      <span className="font-medium text-sm">{filter.name}</span>
                      {getFilterRuleSummary(filter) && (
                        <span className="text-xs opacity-75 hidden lg:inline">({getFilterRuleSummary(filter)})</span>
                      )}
                    </Button>
                    
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        onClick={() => handleEditFilter(filter)}
                        className="h-6 w-6 rounded p-0 hover:bg-accent dark:hover:bg-accent transition-colors"
                        title={t('编辑', 'Edit')}
                        type="button"
                        aria-label={t('编辑', 'Edit')}
                      >
                        <Edit3 className="w-3 h-3" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleDeleteFilter(filter.id)}
                        className="h-6 w-6 rounded p-0 transition-colors"
                        title={t('删除', 'Delete')}
                        type="button"
                        aria-label={t('删除', 'Delete')}
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {presetFilters.length === 0 && customFilters.length === 0 && (
            <div className="text-center py-4 bg-background dark:bg-card rounded-lg border-2 border-dashed border-border dark:border-border">
              <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                {t('暂无过滤器，点击"新建"创建', 'No filters, click "New" to create')}
              </p>
            </div>
          )}

          </div>
        </div>
      </div>

      {/* Filter Modal */}
      <FilterModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        filter={editingFilter}
        onSave={handleSaveFilter}
      />
    </div>
  );
};
