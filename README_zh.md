# GitHub Stars Manager

GitHub Stars Manager 是一个 Vite + React 应用，用于整理 GitHub 星标仓库，支持 AI 分类、全文与向量搜索、仓库问答、Release 追踪、WebDAV 备份和可选的 aria2 RPC 下载。

## 架构

本项目只部署到 Cloudflare Worker：

- Vite 将前端构建到 `dist/`。
- Worker 提供 SPA 静态资源和全部 `/api/*` 接口。
- Cloudflare D1 保存同步后的应用状态。
- `GITHUB_TOKEN` 作为 Worker Secret，用于代管 GitHub 会话和 GitHub API 代理。
- AI、WebDAV、向量搜索和 RPC 配置在应用中维护，并按现有接口同步到 D1。

不再支持独立服务器、桌面壳、容器镜像或反向代理部署。

## 快速开始

安装依赖并启动前端：

```bash
npm ci
npm run dev
```

构建前端：

```bash
npm run build
```

在本地运行 Worker：

```bash
cd cloudflare-worker
npm ci
npm run dev
```

## 部署到 Cloudflare

1. 创建或选择 `cloudflare-worker/wrangler.toml` 中配置的 D1 数据库。
2. 执行现有 D1 migration：

   ```bash
   cd cloudflare-worker
   npx wrangler d1 migrations apply github-stars-manager --remote
   ```

3. 配置 GitHub Worker Secret：

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```

4. 回到仓库根目录部署：

   ```bash
   npm run deploy
   ```

部署脚本始终带 `--keep-vars`，避免覆盖 Cloudflare 中已有变量。完整说明见 [`cloudflare-worker/README.md`](cloudflare-worker/README.md)。

## 保留的 Worker 能力

Worker 保持现有 `/api/*` 契约，包含：

- `/api/health`、`/api/session`
- GitHub 和 AI 代理
- 仓库、Release、应用设置和服务配置的 D1 同步
- aria2 RPC 测试与 Release 下载转发
- SPA 静态资源回退

Worker 暂时不可用时，前端仍保留本地缓存和浏览器直连回退能力；生产入口统一使用 Worker 地址。

## 验证

```bash
npm run check:boundaries
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run test:wrangler
cd cloudflare-worker
npx tsc -p tsconfig.json --noEmit
```

## 安全

不要提交 Token、API Key、本地 `.env`、D1 数据库或生成的部署状态。使用 Wrangler Secret 管理 `GITHUB_TOKEN`，每次部署都保留 `--keep-vars`。
