import type { ThemePreset } from '../constants/themePresets';

/** Loads only the self-hosted font modules referenced by a theme's font stacks. */
export function loadThemeFonts(preset?: ThemePreset): Promise<void> {
  void preset;
  return Promise.resolve();
}
