import React from 'react';
import { RefreshCw, Loader2, TrendingUp, Rocket, Crown, Tag, Search, Settings2 } from 'lucide-react';
import type { DiscoveryChannel, DiscoveryChannelId, DiscoveryChannelIcon } from '../types';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const discoveryChannelIconMap: Record<DiscoveryChannelIcon, React.ComponentType<{ className?: string }>> = {
  trending: TrendingUp,
  rocket: Rocket,
  star: Crown,
  tag: Tag,
  search: Search,
};

interface DiscoveryChannelVisibilityMenuProps {
  channels: DiscoveryChannel[];
  onToggleChannel: (channelId: DiscoveryChannelId) => void;
  language: 'zh' | 'en';
}

export const DiscoveryChannelVisibilityMenu: React.FC<DiscoveryChannelVisibilityMenuProps> = ({
  channels,
  onToggleChannel,
  language,
}) => {
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;
  const enabledCount = channels.filter((channel) => channel.enabled).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('管理发现频道', 'Manage discovery channels')}
          title={t('管理发现频道', 'Manage discovery channels')}
          className="h-8 w-8"
        >
          <Settings2 className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('显示频道', 'Visible channels')}</DropdownMenuLabel>
        {channels.map((channel) => {
          const ChannelIcon = discoveryChannelIconMap[channel.icon] || Crown;
          return (
            <DropdownMenuCheckboxItem
              key={channel.id}
              checked={channel.enabled}
              disabled={channel.enabled && enabledCount <= 1}
              onCheckedChange={() => onToggleChannel(channel.id)}
            >
              <ChannelIcon className="mr-2 h-4 w-4" />
              {language === 'zh' ? channel.name : channel.nameEn}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface DiscoverySidebarProps {
  channels: DiscoveryChannel[];
  selectedChannel: DiscoveryChannelId;
  onChannelSelect: (channel: DiscoveryChannelId) => void;
  onRefreshAll: () => void;
  onToggleChannel: (channelId: DiscoveryChannelId) => void;
  isLoading: Record<DiscoveryChannelId, boolean>;
  lastRefresh: Record<DiscoveryChannelId, string | null>;
  isAnalyzing: boolean;
  language: 'zh' | 'en';
}

export const DiscoverySidebar: React.FC<DiscoverySidebarProps> = ({
  channels,
  selectedChannel,
  onChannelSelect,
  onRefreshAll,
  onToggleChannel,
  isLoading,
  lastRefresh,
  isAnalyzing,
  language,
}) => {
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;

  const formatLastRefresh = (timestamp: string | null | undefined) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return t('刚刚', 'Just now');
    if (diffMin < 60) return `${diffMin}${t('分钟前', 'm ago')}`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}${t('小时前', 'h ago')}`;
    return date.toLocaleDateString();
  };

  const enabledChannels = (channels || []).filter(ch => ch.enabled);
  
  const anyLoading = isLoading && typeof isLoading === 'object' ? Object.values(isLoading).some((v): v is boolean => typeof v === 'boolean' && v) : false;

  return (
    <div className="w-full lg:w-64 shrink-0">
      <div className="bg-card dark:bg-card rounded-xl border border-border dark:border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground dark:text-foreground">
            {t('发现频道', 'Discovery Channels')}
          </h3>
          <div className="flex items-center gap-1">
            <DiscoveryChannelVisibilityMenu
              channels={channels}
              onToggleChannel={onToggleChannel}
              language={language}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRefreshAll}
              disabled={anyLoading || isAnalyzing}
              aria-label={t('刷新全部', 'Refresh All')}
              title={t('刷新全部', 'Refresh All')}
              className="h-8 w-8"
            >
              <RefreshCw className={`w-4 h-4 ${anyLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          {enabledChannels.map((channel) => {
            const isSelected = selectedChannel === channel.id;
            const ChannelIcon = discoveryChannelIconMap[channel.icon] || Crown;
            const channelLoading = isLoading && typeof isLoading === 'object' ? !!(isLoading as Record<string, unknown>)[channel.id] : false;

            return (
              <Button
                key={channel.id}
                onClick={() => onChannelSelect(channel.id)}
                variant="ghost"
                aria-pressed={isSelected}
                className={`flex w-full items-center justify-between px-3 py-2 rounded-lg text-left transition-all duration-200 ${
                  isSelected
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <ChannelIcon className="w-4 h-4" />
                  <span className="font-medium text-sm">
                    {language === 'zh' ? channel.name : channel.nameEn}
                  </span>
                </span>
                <span className="flex items-center gap-2.5">
                  {channelLoading && (
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  )}
                  {(lastRefresh && typeof lastRefresh === 'object' && (lastRefresh as Record<string, unknown>)[channel.id]) ? (
                    <span className="text-xs text-muted-foreground dark:text-muted-foreground">
                      {formatLastRefresh((lastRefresh as Record<string, string | null>)[channel.id])}
                    </span>
                  ) : null}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
