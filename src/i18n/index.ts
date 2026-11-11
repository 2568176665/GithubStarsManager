import i18next, { type i18n as I18nInstance } from 'i18next';
import {
  APP_LANGUAGES,
  FALLBACK_LANGUAGE,
  isAppLanguage,
  languageDefinition,
  type AppLanguage,
} from './languages';

/**
 * i18next 初始化。语言包经 import.meta.glob 懒加载（每个语言独立 chunk，
 * 不占主包预算）；zustand 的 `language` 是唯一事实源，本模块只负责资源
 * 装载与语言切换副作用。
 */
export const I18N_NAMESPACES = [
  'common',
  'app',
  'login',
  'repositories',
  'gists',
  'releases',
  'discovery',
  'chat',
  'search',
  'plugins',
  'settings',
  'ai',
  'services',
  'errors',
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

/**
 * 首帧前必须装载的命名空间：首屏模块（main/App/Header/RepositoryList 等）实际用到的集合。
 * 其余命名空间只归属懒加载视图，交给 useT/makeT 在首次渲染时装载。
 */
export const BOOT_NAMESPACES: readonly I18nNamespace[] = [
  'common',
  'app',
  'login',
  'repositories',
  'chat',
  'settings',
];

const localeModules = import.meta.glob<{ default: Record<string, unknown> }>('../locales/*/*.json');

const namespaceLoaders = new Map<string, () => Promise<{ default: Record<string, unknown> }>>();
for (const [filePath, loader] of Object.entries(localeModules)) {
  const namespace = filePath.slice(filePath.lastIndexOf('/') + 1).replace(/\.json$/, '');
  if (!(I18N_NAMESPACES as readonly string[]).includes(namespace)) continue;
  const language = filePath.slice(0, filePath.lastIndexOf('/')).split('/').pop();
  if (language) namespaceLoaders.set(`${language}/${namespace}`, loader);
}

const loadedNamespaces = new Map<AppLanguage, Set<I18nNamespace>>();

function loadedNamespacesOf(language: AppLanguage): Set<I18nNamespace> {
  let loaded = loadedNamespaces.get(language);
  if (!loaded) {
    loaded = new Set<I18nNamespace>();
    loadedNamespaces.set(language, loaded);
  }
  return loaded;
}

/** 同步判断命名空间是否已装载，供渲染路径跳过无谓的 Promise 构造。 */
export function namespacesLoaded(
  language: AppLanguage,
  namespaces: readonly I18nNamespace[],
): boolean {
  const loaded = loadedNamespacesOf(language);
  return namespaces.every((namespace) => loaded.has(namespace));
}

void i18next.init({
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  resources: {},
  partialBundledLanguages: true,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

/** 装载指定命名空间（幂等；并发调用只发起一次请求）。 */
export async function ensureNamespacesLoaded(
  language: AppLanguage,
  namespaces: readonly I18nNamespace[],
): Promise<void> {
  const loaded = loadedNamespacesOf(language);
  const pending = namespaces.filter((namespace) => !loaded.has(namespace));
  if (pending.length === 0) return;
  pending.forEach((namespace) => loaded.add(namespace));
  await Promise.all(
    pending.map(async (namespace) => {
      const loader = namespaceLoaders.get(`${language}/${namespace}`);
      if (!loader) {
        loaded.delete(namespace);
        return;
      }
      const module = await loader();
      i18next.addResourceBundle(language, namespace, module.default, true, true);
    }),
  );
}

/**
 * 首帧前装载：当前语言与回退语言的 BOOT_NAMESPACES。
 * 回退语言缺失会让缺键露出 raw key，因此与主语言一起等待。
 */
export async function preloadBootNamespaces(language: AppLanguage): Promise<void> {
  const targets = language === FALLBACK_LANGUAGE ? [language] : [language, FALLBACK_LANGUAGE];
  await Promise.all(targets.map((target) => ensureNamespacesLoaded(target, BOOT_NAMESPACES)));
}

/**
 * 视图级预取：在 React.lazy 开始下载视图 chunk 的同时并行装载它用到的命名空间，
 * 避免「视图 chunk 到了再取语言包」串行多一个往返。
 */
export function preloadNamespaces(namespaces: readonly I18nNamespace[]): void {
  const language = getCurrentAppLanguage();
  const targets = language === FALLBACK_LANGUAGE ? [language] : [language, FALLBACK_LANGUAGE];
  void Promise.all(targets.map((target) => ensureNamespacesLoaded(target, namespaces)));
}

/** 同步读取当前已装载语言（供 React 外的调用方使用）。 */
export function getCurrentAppLanguage(): AppLanguage {
  const current = i18next.language;
  return isAppLanguage(current) ? current : FALLBACK_LANGUAGE;
}

/**
 * 切换应用语言：装载目标语言与回退语言包 → 切换 i18next → 更新 <html lang>。
 * 由 App 的 language 副作用调用；zustand 仍是事实源。
 */
let languageSwitchSeq = 0;

export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  const requestId = ++languageSwitchSeq;
  await preloadBootNamespaces(language);
  // 快速连续切换时仅应用最后一次请求，避免旧请求晚到覆盖新语言
  if (requestId !== languageSwitchSeq) return;
  await i18next.changeLanguage(language);
  if (requestId !== languageSwitchSeq) return;
  document.documentElement.lang = languageDefinition(language).intlLocale;
}

export const i18n: I18nInstance = i18next;

export { APP_LANGUAGES };
export * from './languages';
