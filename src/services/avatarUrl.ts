const AVATAR_PROXY_PATH = '/api/avatar';

/**
 * 把 GitHub 头像地址改写到 Worker 同域代理，走边缘缓存以避免直连
 * avatars.githubusercontent.com 的高延迟；无法同域代理时原样返回，保证不破图。
 */
export function avatarSrc(rawUrl: string): string {
  if (typeof rawUrl !== 'string' || !rawUrl) return '';
  // Vite dev 没有 /api 代理，开发态直接走原始地址。
  if (import.meta.env.DEV || typeof window === 'undefined') return rawUrl;
  const { protocol } = window.location;
  if (protocol !== 'http:' && protocol !== 'https:') return rawUrl;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return rawUrl;
  return `${AVATAR_PROXY_PATH}?u=${encodeURIComponent(rawUrl)}`;
}
