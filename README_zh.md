# GitHub Stars Manager

一个浏览器优先的 GitHub 星标仓库管理工具，帮助你整理、重新发现并持续跟进收藏的仓库。生产环境由单个 Cloudflare Worker 提供，同时保留前端本地缓存和浏览器直连 GitHub 的回退能力。

## 项目方向

- 聚焦浏览器中的 GitHub 星标整理与发现。
- Vite + React 前端和 `/api/*` 接口统一部署到 Cloudflare Worker，D1 保存同步的应用状态。
- 保留本地缓存和浏览器直连回退，不把应用改造成依赖独立后端的服务。
- AI、Vectorize 向量搜索、WebDAV 备份和 aria2 下载均为可选能力。
- 本 fork 只支持 Worker 部署，不加入独立服务器、桌面客户端、容器或反向代理。

## 主要功能

- 整理星标仓库，并将分类写入 GitHub Lists。
- 通过可配置的发现频道浏览仓库；也可以粘贴链接、Markdown、`owner/repo` 或 JSON 批量 Star。
- 跟踪 Release，并按关键词和仓库名单包含或排除项目。
- 搜索仓库；Worker 使用 FTS5，Vectorize 可作为可选增强。
- 按需启用 AI 辅助功能、WebDAV 备份和 aria2 下载。

## 项目结构

- `src/`：Vite + React 浏览器应用和本地缓存。
- `cloudflare-worker/`：SPA 入口、`/api/*` 路由、Wrangler 配置和 D1 migrations。
- `GITHUB_TOKEN`：Worker Secret，用于代管 GitHub 会话和 GitHub API 代理。
- D1：同步仓库、Release、应用设置和服务配置。

Cloudflare Worker 是唯一支持的生产入口。修改前端或 Worker 时，应保留现有 API 契约和浏览器回退行为。

## 本地开发

```bash
npm ci
npm run dev
```

本地运行 Worker：

```bash
cd cloudflare-worker
npm ci
npm run dev
```

## 部署到 Cloudflare

在 `cloudflare-worker/wrangler.toml` 中配置 D1 数据库；首次配置环境时，将 `GITHUB_TOKEN` 设置为 Worker Secret。只有存在尚未应用的 schema 变更时才执行 D1 migration：

```bash
cd cloudflare-worker
npx wrangler d1 migrations apply github-stars-manager --remote
npx wrangler secret put GITHUB_TOKEN
```

回到仓库根目录部署：

```bash
npm run deploy
```

部署脚本会构建前端，并通过 Wrangler 的 `--keep-vars` 保留 Cloudflare 中现有变量。Worker 配置详见 [`cloudflare-worker/README.md`](cloudflare-worker/README.md)。

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

不要提交 Token、API Key、`.env`、D1 数据或生成的部署状态。使用 Wrangler Secret 管理 `GITHUB_TOKEN`，每次部署都保留 `--keep-vars`。
