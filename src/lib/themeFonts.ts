import type { ThemePreset } from '../constants/themePresets';

type FontImporter = () => Promise<unknown>;

interface ThemeFont {
  family: string;
  importFont: FontImporter;
}

// Keep import paths literal so Vite can split every self-hosted font into its own chunk.
const THEME_FONTS: readonly ThemeFont[] = [
  { family: 'Open Sans Variable', importFont: () => import('@fontsource-variable/open-sans') },
  { family: 'Inter Variable', importFont: () => import('@fontsource-variable/inter') },
  { family: 'Outfit Variable', importFont: () => import('@fontsource-variable/outfit') },
  { family: 'Geist Variable', importFont: () => import('@fontsource-variable/geist') },
  { family: 'Geist Mono Variable', importFont: () => import('@fontsource-variable/geist-mono') },
  { family: 'Montserrat Variable', importFont: () => import('@fontsource-variable/montserrat') },
  { family: 'DM Sans Variable', importFont: () => import('@fontsource-variable/dm-sans') },
  { family: 'Plus Jakarta Sans Variable', importFont: () => import('@fontsource-variable/plus-jakarta-sans') },
  { family: 'JetBrains Mono Variable', importFont: () => import('@fontsource-variable/jetbrains-mono') },
  { family: 'Fira Code Variable', importFont: () => import('@fontsource-variable/fira-code') },
  { family: 'IBM Plex Mono', importFont: () => import('@fontsource/ibm-plex-mono') },
  { family: 'Space Mono', importFont: () => import('@fontsource/space-mono') },
  { family: 'Merriweather', importFont: () => import('@fontsource/merriweather') },
  { family: 'Lora', importFont: () => import('@fontsource/lora') },
  { family: 'Playfair Display', importFont: () => import('@fontsource/playfair-display') },
];

const fontPromises = new Map<FontImporter, Promise<void>>();

function fontStacks(preset: ThemePreset): string[] {
  return [preset.fontSans, preset.fontMono, preset.fontSerif].filter(
    (stack): stack is string => Boolean(stack),
  );
}

function loadFont(font: ThemeFont): Promise<void> {
  const cached = fontPromises.get(font.importFont);
  if (cached) return cached;

  const promise = font.importFont()
    .then(() => undefined)
    .catch((error: unknown) => {
      // A fallback family in the CSS stack keeps the application usable.
      console.warn(`Failed to load theme font "${font.family}".`, error);
    });
  fontPromises.set(font.importFont, promise);
  return promise;
}

/** Loads only the self-hosted font modules referenced by a theme's font stacks. */
export function loadThemeFonts(preset: ThemePreset): Promise<void> {
  const stacks = fontStacks(preset);
  const matchingFonts = THEME_FONTS.filter(({ family }) =>
    stacks.some((stack) => stack.includes(family)),
  );
  return Promise.all(matchingFonts.map(loadFont)).then(() => undefined);
}
