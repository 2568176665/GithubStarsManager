import { describe, expect, it, vi } from 'vitest';
import { THEME_PRESETS } from '../constants/themePresets';

const fontImports = vi.hoisted(() => ({
  inter: vi.fn(),
  jetbrainsMono: vi.fn(),
  merriweather: vi.fn(),
  plusJakartaSans: vi.fn(),
  ibmPlexMono: vi.fn(),
  lora: vi.fn(),
}));

vi.mock('@fontsource-variable/inter', () => {
  fontImports.inter();
  return {};
});

vi.mock('@fontsource-variable/jetbrains-mono', () => {
  fontImports.jetbrainsMono();
  return {};
});

vi.mock('@fontsource/merriweather', () => {
  fontImports.merriweather();
  return {};
});

vi.mock('@fontsource-variable/plus-jakarta-sans', () => {
  fontImports.plusJakartaSans();
  return {};
});

vi.mock('@fontsource/ibm-plex-mono', () => {
  fontImports.ibmPlexMono();
  return {};
});

vi.mock('@fontsource/lora', () => {
  fontImports.lora();
  throw new Error('font unavailable');
});

import { loadThemeFonts } from './themeFonts';

describe('loadThemeFonts', () => {
  it('loads only the font modules named by the selected preset and caches their promises', async () => {
    const preset = THEME_PRESETS.find((item) => item.id === 'enterprise-mod-2')!;

    await Promise.all([loadThemeFonts(preset), loadThemeFonts(preset)]);

    expect(fontImports.inter).toHaveBeenCalledOnce();
    expect(fontImports.jetbrainsMono).toHaveBeenCalledOnce();
    expect(fontImports.merriweather).toHaveBeenCalledOnce();
  });

  it('does not request a font when no preset stack names it', async () => {
    const callsBefore = {
      inter: fontImports.inter.mock.calls.length,
      jetbrainsMono: fontImports.jetbrainsMono.mock.calls.length,
      merriweather: fontImports.merriweather.mock.calls.length,
    };

    await loadThemeFonts({
      ...THEME_PRESETS[0],
      fontSans: 'system-ui, sans-serif',
    });

    expect(fontImports.inter).toHaveBeenCalledTimes(callsBefore.inter);
    expect(fontImports.jetbrainsMono).toHaveBeenCalledTimes(callsBefore.jetbrainsMono);
    expect(fontImports.merriweather).toHaveBeenCalledTimes(callsBefore.merriweather);
  });

  it('keeps rendering unblocked when a font module cannot load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const preset = THEME_PRESETS.find((item) => item.id === 'autoblog')!;

    await expect(loadThemeFonts(preset)).resolves.toBeUndefined();

    expect(fontImports.plusJakartaSans).toHaveBeenCalledOnce();
    expect(fontImports.ibmPlexMono).toHaveBeenCalledOnce();
    expect(fontImports.lora).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Failed to load theme font "Lora".', expect.any(Error));
    warn.mockRestore();
  });
});
