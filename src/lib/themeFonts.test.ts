import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '../constants/themePresets';
import { loadThemeFonts } from './themeFonts';

describe('loadThemeFonts', () => {
  it('resolves immediately without loading external fonts', async () => {
    await expect(loadThemeFonts(DEFAULT_PRESET)).resolves.toBeUndefined();
    await expect(loadThemeFonts()).resolves.toBeUndefined();
  });
});
