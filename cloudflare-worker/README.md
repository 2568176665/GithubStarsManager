# Cloudflare Worker 部署

本项目只部署到 Cloudflare Worker。根目录 Vite 构建生成 `dist/`，Worker 同时提供 SPA 静态资源、`/api/*` 接口和 D1 数据持久化；不需要单独的服务器、桌面客户端或容器。

## 前置条件

- Cloudflare 账号和已登录的 Wrangler
- 根目录与本目录的 Node.js 依赖
- 已创建名为 `github-stars-manager` 的 D1 数据库，或按 `wrangler.toml` 调整数据库配置

## 首次部署

在仓库根目录执行：

```bash
npm ci
npm run build
cd cloudflare-worker
npm ci
npx wrangler d1 migrations apply github-stars-manager --remote
npx wrangler secret put GITHUB_TOKEN
npm run deploy
```

`npm run deploy` 已包含 `--keep-vars`，会保留 Cloudflare 中已有的变量。`GITHUB_TOKEN` 用于 Worker 代管 GitHub 账号和 GitHub API 代理；AI 配置、WebDAV 配置、向量搜索配置及应用状态由前端保存到 D1。

## 日常开发与更新

根目录构建前端：

```bash
npm run build
```

本地运行 Worker：

```bash
cd cloudflare-worker
npm run dev
```

代码或前端资源更新后，从根目录执行 `npm run deploy`。只有 D1 schema 发生变化时才需要新增并执行 migration；当前 schema 位于 `migrations/`，不要修改线上已有 migration。

## Worker API

Worker 保持现有 `/api/*` 契约，主要包括：

- `/api/health`：健康检查
- `/api/session`：使用 Worker Secret 获取代管 GitHub 账号
- `/api/proxy/github/*`：GitHub API 代理
- `/api/proxy/ai`：AI 请求代理
- `/api/repositories`、`/api/releases`、`/api/settings` 及配置接口：D1 同步
- `/api/download/rpc`：通过 aria2 RPC 下载 Release 资产

前端在 Worker 不可达时仍可使用本地缓存和浏览器直连能力；生产入口统一使用部署后的 Worker 地址。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `src/index.ts` | Worker 请求处理、API 和静态资源入口 |
| `migrations/` | D1 migration |
| `wrangler.toml` | Worker、Assets 和 D1 绑定配置 |
| `package.json` | Wrangler 与 Worker 类型检查依赖 |

## Secret 与配置

不要把 Secret 写入仓库或提交 `.env`。使用 Wrangler 管理 Worker Secret：

```bash
npx wrangler secret put GITHUB_TOKEN
```

部署 Worker 时始终保留 `--keep-vars`，避免部署配置覆盖线上已有变量。
