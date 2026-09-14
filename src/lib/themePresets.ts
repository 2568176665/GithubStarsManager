import type { ThemePreset, ThemePresetId } from '../constants/themePresets';

export const THEME_STYLE_TAG_ID = 'gsm-theme-presets';

/**
 * Builds the CSS text for presets. Since only the default preset is supported,
 * no override CSS is generated and base styles in index.css apply.
 */
export function buildThemePresetCss(): string {
  return '';
}

/**
 * Cleans up any leftover preset style tag.
 */
export function ensureThemeStyleTag(doc: Document = document): void {
  const tag = doc.getElementById(THEME_STYLE_TAG_ID);
  if (tag) {
    tag.remove();
  }
}

/**
 * Ensures the data-theme attribute is removed so the default stylesheet applies.
 */
export function applyThemePreset(id?: ThemePresetId | string, root: HTMLElement = document.documentElement): void {
  void id;
  delete root.dataset.theme;
}

export interface ThemeSwatchColors {
  background: string;
  card: string;
  primary: string;
  accent: string;
  foreground: string;
}

/** Preview colors resolved for the active mode. */
export function getThemeSwatch(preset: ThemePreset, isDark: boolean): ThemeSwatchColors {
  const colors = isDark ? preset.darkColors : preset.lightColors;
  return {
    background: `hsl(${colors.background ?? '210 40% 98%'})`,
    card: `hsl(${colors.card ?? '0 0% 100%'})`,
    primary: `hsl(${colors.primary ?? '222.2 47.4% 11.2%'})`,
    accent: `hsl(${colors.accent ?? '210 40% 92%'})`,
    foreground: `hsl(${colors.foreground ?? '222.2 84% 4.9%'})`,
  };
}
