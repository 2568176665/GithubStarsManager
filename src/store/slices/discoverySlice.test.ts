import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultDiscoveryChannels } from '../schema';

let useAppStore: typeof import('../useAppStore').useAppStore;

beforeAll(async () => {
  ({ useAppStore } = await vi.importActual<typeof import('../useAppStore')>('../useAppStore'));
});

describe('discovery channel visibility', () => {
  beforeEach(() => {
    useAppStore.setState({
      discoveryChannels: defaultDiscoveryChannels.map((channel) => ({ ...channel, enabled: true })),
      selectedDiscoveryChannel: 'trending',
    });
  });

  it('keeps the last enabled channel visible', () => {
    useAppStore.setState({
      discoveryChannels: defaultDiscoveryChannels.map((channel) => ({
        ...channel,
        enabled: channel.id === 'trending',
      })),
    });

    useAppStore.getState().toggleDiscoveryChannel('trending');

    expect(useAppStore.getState().discoveryChannels.find((channel) => channel.id === 'trending')?.enabled).toBe(true);
  });

  it('selects the first enabled channel when hiding the current channel', () => {
    useAppStore.setState({ selectedDiscoveryChannel: 'hot-release' });

    useAppStore.getState().toggleDiscoveryChannel('hot-release');

    expect(useAppStore.getState().selectedDiscoveryChannel).toBe('trending');
    expect(useAppStore.getState().discoveryChannels.find((channel) => channel.id === 'hot-release')?.enabled).toBe(false);
  });
});
