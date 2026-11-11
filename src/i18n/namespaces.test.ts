import { describe, expect, it } from 'vitest';
import {
  BOOT_NAMESPACES,
  I18N_NAMESPACES,
  ensureNamespacesLoaded,
  namespacesLoaded,
  preloadBootNamespaces,
} from './index';

/**
 * 测试环境（src/test/setup.ts）会把全部语言资源从磁盘直接灌进 i18next，
 * 因此这里断言的是「装载门控」——决定启动时会发出哪些语言包请求的逻辑，
 * 而不是 i18next 里最终有没有资源。真实 chunk 请求数在构建产物与线上验证。
 */
const DEFERRED_NAMESPACES = I18N_NAMESPACES.filter(
  (namespace) => !BOOT_NAMESPACES.includes(namespace),
);

describe('i18n 命名空间按需装载', () => {
  it('BOOT_NAMESPACES 是 I18N_NAMESPACES 的真子集', () => {
    for (const namespace of BOOT_NAMESPACES) {
      expect(I18N_NAMESPACES).toContain(namespace);
    }
    expect(DEFERRED_NAMESPACES.length).toBeGreaterThan(0);
  });

  it('未装载状态默认短路，ensureNamespacesLoaded 后转为已装载', async () => {
    expect(namespacesLoaded('ja', ['common'])).toBe(false);
    expect(namespacesLoaded('ja', ['releases'])).toBe(false);
    await ensureNamespacesLoaded('ja', ['common']);
    expect(namespacesLoaded('ja', ['common'])).toBe(true);
    expect(namespacesLoaded('ja', ['releases'])).toBe(false);
  });

  it('重复装载是幂等的', async () => {
    await ensureNamespacesLoaded('ko', ['login']);
    await expect(ensureNamespacesLoaded('ko', ['login'])).resolves.toBeUndefined();
  });

  it('preloadBootNamespaces 只覆盖当前语言与回退语言的首屏命名空间', async () => {
    await preloadBootNamespaces('zh');
    for (const namespace of BOOT_NAMESPACES) {
      expect(namespacesLoaded('zh', [namespace])).toBe(true);
      expect(namespacesLoaded('en', [namespace])).toBe(true);
    }
    expect(namespacesLoaded('zh', DEFERRED_NAMESPACES)).toBe(false);
    expect(namespacesLoaded('en', DEFERRED_NAMESPACES)).toBe(false);
    expect(namespacesLoaded('fr', I18N_NAMESPACES)).toBe(false);
  });
});
