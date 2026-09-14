import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  THEME_STYLE_TAG_ID,
  applyThemePreset,
  buildThemePresetCss,
  ensureThemeStyleTag,
  getThemeSwatch,
} from './themePresets';
import { DEFAULT_PRESET, DEFAULT_THEME_PRESET_ID } from '../constants/themePresets';

describe('themePresets injector', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('returns empty css since only the default preset is retained', () => {
    const css = buildThemePresetCss();
    expect(css).toBe('');
  });

  it('removes leftover preset style tags from the document', () => {
    const tag = document.createElement('style');
    tag.id = THEME_STYLE_TAG_ID;
    tag.textContent = 'body { color: red; }';
    document.head.appendChild(tag);

    ensureThemeStyleTag();
    expect(document.getElementById(THEME_STYLE_TAG_ID)).toBeNull();
  });

  it('always clears data-theme attribute on root element', () => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'deep-purple');

    applyThemePreset(DEFAULT_THEME_PRESET_ID, root);
    expect(root.hasAttribute('data-theme')).toBe(false);

    root.setAttribute('data-theme', 'legacy-theme');
    applyThemePreset('anything', root);
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('resolves default swatch colors for active mode', () => {
    const light = getThemeSwatch(DEFAULT_PRESET, false);
    const dark = getThemeSwatch(DEFAULT_PRESET, true);
    expect(light.background).toMatch(/^hsl\(/);
    expect(dark.background).toMatch(/^hsl\(/);
    expect(light.background).not.toBe(dark.background);
  });
});
