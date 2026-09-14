import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET,
  DEFAULT_THEME_PRESET_ID,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  getThemePreset,
  isThemePresetId,
} from './themePresets';

const PALETTE_KEYS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'border-strong',
  'input',
  'ring',
  'selection',
  'selection-foreground',
  'search-highlight',
] as const;

describe('themePresets registry', () => {
  it('contains only the default preset', () => {
    expect(THEME_PRESETS).toHaveLength(1);
    expect(THEME_PRESETS[0].id).toBe(DEFAULT_THEME_PRESET_ID);
    expect(THEME_PRESET_IDS).toEqual([DEFAULT_THEME_PRESET_ID]);
  });

  it('provides complete palettes for light and dark modes in default preset', () => {
    for (const palette of [DEFAULT_PRESET.lightColors, DEFAULT_PRESET.darkColors]) {
      for (const key of PALETTE_KEYS) {
        expect(palette[key]).toBeDefined();
      }
    }
  });

  it('identifies valid preset ids strictly', () => {
    expect(isThemePresetId('default')).toBe(true);
    expect(isThemePresetId('deep-purple')).toBe(false);
    expect(isThemePresetId('claude')).toBe(false);
    expect(isThemePresetId(null)).toBe(false);
    expect(isThemePresetId(undefined)).toBe(false);
  });

  it('always returns default preset from getThemePreset', () => {
    expect(getThemePreset('default')).toEqual(DEFAULT_PRESET);
    expect(getThemePreset('anything')).toEqual(DEFAULT_PRESET);
    expect(getThemePreset()).toEqual(DEFAULT_PRESET);
  });
});
