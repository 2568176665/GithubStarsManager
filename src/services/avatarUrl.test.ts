import { afterEach, describe, expect, it, vi } from 'vitest';
import { avatarSrc } from './avatarUrl';

const AVATAR = 'https://avatars.githubusercontent.com/u/1?s=64';

describe('avatarSrc', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an empty string for empty input', () => {
    expect(avatarSrc('')).toBe('');
  });

  it('keeps the original URL in Vite dev where /api is not proxied', () => {
    vi.stubEnv('DEV', true);
    expect(avatarSrc(AVATAR)).toBe(AVATAR);
  });

  it('rewrites to the same-origin worker proxy outside dev', () => {
    vi.stubEnv('DEV', false);
    expect(avatarSrc(AVATAR)).toBe(`/api/avatar?u=${encodeURIComponent(AVATAR)}`);
  });

  it('keeps unparsable and non-http URLs untouched', () => {
    vi.stubEnv('DEV', false);
    expect(avatarSrc('not a url')).toBe('not a url');
    expect(avatarSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
});
