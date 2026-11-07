/**
 * 桌面桥接已移除。
 *
 * 本 fork 只发布 Cloudflare Worker + Vite 浏览器客户端，不构建 Electron 桌面端，
 * 因此原先经 `window.electronAPI` 走主进程 IPC 的能力（系统代理、诊断日志、
 * MCP 桥、插件市场、X 鉴权加密存储）都不再存在。保留此模块是为了让沿用
 * `isElectron()` 守卫的历史代码在浏览器里恒为“非桌面”，从而让仅桌面可用的
 * 分支保持惰性，而不是在运行时抛出。
 */

/** 浏览器客户端永远不会运行在 Electron 主进程中。 */
export const isElectron = (): boolean => false;

/** 桌面端 safeStorage 加密的 X 鉴权 Cookie 不可用。 */
export const loadEncryptedXAuthViaDesktop = async (): Promise<{
  authToken: string;
  ct0: string;
} | null> => null;

/** 桌面端 safeStorage 加密写入不可用（无声跳过，调用方无需分支）。 */
export const saveEncryptedXAuthViaDesktop = async (auth: {
  authToken: string;
  ct0: string;
}): Promise<void> => {
  void auth;
};

/** 桌面端 safeStorage 清理不可用（无声跳过，调用方无需分支）。 */
export const clearEncryptedXAuthViaDesktop = async (): Promise<void> => {};
