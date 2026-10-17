/**
 * 剪贴板工具函数
 * 提供兼容性检查和降级方案
 */

/**
 * 获取剪贴板不支持时的错误信息
 */
export const getClipboardErrorMessage = (
  operation: 'read' | 'write',
  language: 'zh' | 'en' = 'zh'
): string => {
  const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;

  if (!isSecureContext) {
    return language === 'zh'
      ? '剪贴板功能需要使用 HTTPS 协议访问'
      : 'Clipboard requires HTTPS protocol';
  }

  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;

  if (operation === 'write' && !(isSecureContext && !!clipboard && typeof clipboard.writeText === 'function')) {
    return language === 'zh'
      ? '您的浏览器不支持剪贴板写入功能，请升级浏览器'
      : 'Your browser does not support clipboard write. Please upgrade your browser';
  }

  if (operation === 'read' && !(isSecureContext && !!clipboard && typeof clipboard.readText === 'function')) {
    return language === 'zh'
      ? '您的浏览器不支持剪贴板读取功能，请升级浏览器'
      : 'Your browser does not support clipboard read. Please upgrade your browser';
  }

  return language === 'zh'
    ? '剪贴板操作失败，请检查浏览器权限设置'
    : 'Clipboard operation failed. Please check browser permissions';
};

/** 检查是否支持写入剪贴板 */
const canWriteText = (): boolean => {
  const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  return isSecureContext && !!clipboard && typeof clipboard.writeText === 'function';
};

/** 检查是否支持读取剪贴板 */
const canReadText = (): boolean => {
  const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  return isSecureContext && !!clipboard && typeof clipboard.readText === 'function';
};

/**
 * 安全的剪贴板写入函数
 * 带有兼容性检查和降级方案
 */
export const safeWriteText = async (text: string): Promise<{ success: boolean; error?: string }> => {
  if (!canWriteText()) {
    // 尝试使用降级方案（execCommand）
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const success = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (success) {
        return { success: true };
      }
    } catch {
      // 降级方案失败，返回错误
    }

    return {
      success: false,
      error: getClipboardErrorMessage('write'),
    };
  }

  try {
    await navigator.clipboard.writeText(text);
    return { success: true };
  } catch {
    return {
      success: false,
      error: getClipboardErrorMessage('write'),
    };
  }
};

/**
 * 安全的剪贴板读取函数
 * 带有兼容性检查
 */
export const safeReadText = async (): Promise<{ success: boolean; text?: string; error?: string }> => {
  if (!canReadText()) {
    return {
      success: false,
      error: getClipboardErrorMessage('read'),
    };
  }

  try {
    const text = await navigator.clipboard.readText();
    return { success: true, text };
  } catch {
    return {
      success: false,
      error: getClipboardErrorMessage('read'),
    };
  }
};
