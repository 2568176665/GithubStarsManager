// Load polyfills first
import './polyfills.ts';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { DialogProvider } from './hooks/useDialog';
import { TooltipProvider } from './components/ui/tooltip';
import { logger } from './services/logger';
import { installFetchCapture } from './services/fetchCapture';
import { installGlobalErrorHandlers } from './services/globalErrorHandlers';
import { useAppStore } from './store/useAppStore';
import { ensureLanguageLoaded, FALLBACK_LANGUAGE } from './i18n';

logger.info('app', 'Main.tsx loading');

// Diagnostics pipeline must be live before React renders so the fetch ledger,
// the journal bridge, and the global error handlers see every early request
// and error. All three are idempotent, no-ops in web mode where applicable,
// and never throw into the bootstrap path.
try {
  installFetchCapture();
  installGlobalErrorHandlers();
} catch (error) {
  logger.errorFromError('app', 'Failed to install diagnostics pipeline', error);
}

const bootstrap = async (): Promise<void> => {
  try {
    // 首帧前装载初始语言包与回退语言包，避免界面闪现 i18n key。
    // 持久化语言在水合完成后由 App 的 language 副作用切换。
    const initialLanguage = useAppStore.getState().language;
    await Promise.all([
      ensureLanguageLoaded(initialLanguage),
      ensureLanguageLoaded(FALLBACK_LANGUAGE),
    ]);
    logger.info('app', 'Initial language pack loaded', { initialLanguage });

    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error('Root element not found');
    }

    logger.info('app', 'Root element found, creating React root');

    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <DialogProvider>
            <TooltipProvider delayDuration={300}>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </TooltipProvider>
          </DialogProvider>
        </ErrorBoundary>
      </StrictMode>
    );

    logger.info('app', 'React app rendered');
  } catch (error) {
  logger.error('app', 'Failed to render React app', error);
  const strings = (() => {
    const lang = navigator.language?.startsWith('zh') ? 'zh' : 'en';
    return {
      title: lang === 'zh' ? '应用加载失败' : 'Application Failed to Load',
      desc: lang === 'zh'
        ? '您的浏览器可能不支持运行此应用。请尝试使用最新版本的 Chrome、Firefox、Safari 或 Edge。'
        : 'Your browser may not support running this app. Please try using the latest version of Chrome, Firefox, Safari, or Edge.',
      button: lang === 'zh' ? '重新加载' : 'Reload',
    };
  })();
  const fallback = document.getElementById('root') || (() => {
    const el = document.createElement('div');
    el.id = 'root';
    document.body.appendChild(el);
    return el;
  })();
  fallback.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
      <div style="max-width: 400px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">😵</div>
        <h1 style="font-size: 20px; font-weight: bold; margin-bottom: 8px; color: hsl(var(--foreground, 222.2 84% 4.9%));">${strings.title}</h1>
        <p style="color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%)); margin-bottom: 16px;">${strings.desc}</p>
        <button onclick="window.location.reload()" style="padding: 8px 16px; background: hsl(var(--primary, 222.2 47.4% 11.2%)); color: hsl(var(--primary-foreground, 210 40% 98%)); border: none; border-radius: 6px; cursor: pointer;">${strings.button}</button>
      </div>
    </div>
  `;
  }
};

void bootstrap();
