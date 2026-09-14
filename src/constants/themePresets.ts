/**
 * Theme preset registry.
 *
 * Only the default preset is retained. The default preset mirrors the
 * shadcn variables in src/index.css.
 */

export const DEFAULT_THEME_PRESET_ID = 'default' as const;

export const THEME_PRESET_IDS = [DEFAULT_THEME_PRESET_ID] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export type ThemePalette = Record<string, string>;

export interface ThemePreset {
  id: ThemePresetId;
  labelZh: string;
  labelEn: string;
  lightColors: ThemePalette;
  darkColors: ThemePalette;
  radius?: string;
  fontSans?: string;
  fontMono?: string;
  fontSerif?: string;
  shadowColor?: string;
  shadowOpacity?: number;
  shadow?: string;
}

const DEFAULT_LIGHT_COLORS: ThemePalette = {
  background: '210 40% 98%',
  foreground: '222.2 84% 4.9%',
  card: '0 0% 100%',
  'card-foreground': '222.2 84% 4.9%',
  popover: '0 0% 100%',
  'popover-foreground': '222.2 84% 4.9%',
  primary: '222.2 47.4% 11.2%',
  'primary-foreground': '210 40% 98%',
  secondary: '210 40% 96.1%',
  'secondary-foreground': '222.2 47.4% 11.2%',
  muted: '210 40% 96.1%',
  'muted-foreground': '215.4 16.3% 46.9%',
  accent: '210 40% 92%',
  'accent-foreground': '222.2 47.4% 11.2%',
  destructive: '0 84.2% 60.2%',
  'destructive-foreground': '210 40% 98%',
  border: '214.3 31.8% 91.4%',
  'border-strong': '214.3 25% 80%',
  input: '214.3 31.8% 91.4%',
  ring: '222.2 84% 4.9%',
  selection: '222.2 47.4% 55.5%',
  'selection-foreground': '222.2 84% 4.9%',
  'search-highlight': '222.2 28.4% 72.8%',
};

const DEFAULT_DARK_COLORS: ThemePalette = {
  background: '222.2 84% 4.9%',
  foreground: '210 40% 98%',
  card: '222.2 47.4% 11.2%',
  'card-foreground': '210 40% 98%',
  popover: '222.2 47.4% 11.2%',
  'popover-foreground': '210 40% 98%',
  primary: '210 40% 98%',
  'primary-foreground': '222.2 47.4% 11.2%',
  secondary: '217.2 32.6% 17.5%',
  'secondary-foreground': '210 40% 98%',
  muted: '217.2 32.6% 17.5%',
  'muted-foreground': '215 20.2% 65.1%',
  accent: '217.2 32.6% 21%',
  'accent-foreground': '210 40% 98%',
  destructive: '0 62.8% 30.6%',
  'destructive-foreground': '210 40% 98%',
  border: '217.2 32.6% 17.5%',
  'border-strong': '217.2 32.6% 28%',
  input: '217.2 32.6% 17.5%',
  ring: '212.7 26.8% 83.9%',
  selection: '210 40% 40%',
  'selection-foreground': '210 40% 98%',
  'search-highlight': '210 24% 29.6%',
};

export const DEFAULT_PRESET: ThemePreset = {
  id: DEFAULT_THEME_PRESET_ID,
  labelZh: '默认',
  labelEn: 'Default',
  lightColors: DEFAULT_LIGHT_COLORS,
  darkColors: DEFAULT_DARK_COLORS,
};

export const THEME_PRESETS: ThemePreset[] = [DEFAULT_PRESET];

export function getThemePreset(id?: string): ThemePreset {
  void id;
  return DEFAULT_PRESET;
}

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return value === DEFAULT_THEME_PRESET_ID;
}
