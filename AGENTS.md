# Repository Guidelines

这个 fork 仓库只部署到 Cloudflare Worker，只保留 Vite 前端（`src/`）、Worker（`cloudflare-worker/`）、D1 migrations、必要测试和工程配置。生产环境不运行独立服务器，不构建桌面客户端，也不使用容器或反向代理。

## Project Structure & Module Organization

- `src/` contains the Vite React/TypeScript frontend: components, feature logic, Zustand state, services, utilities, and types are grouped by directory.
- `cloudflare-worker/` contains the Worker, `/api/*` routes, Wrangler configuration, and D1 migrations.
- Put static assets in `public/` or `assets/`, documentation in `docs/`, and treat `dist/` as generated output.
- Do not add server, desktop, container, or reverse-proxy code back to this fork. Keep frontend local-cache/direct-fallback behavior because it is part of the browser client.

## Build, Test, and Development Commands

Run `npm ci` at the repository root first; run `npm ci` in `cloudflare-worker/` when Worker dependencies are needed.

- `npm run dev` starts Vite.
- `npm run build` creates the frontend bundle and checks size limits.
- `npm run lint`, `npm run typecheck`, and `npm run check:boundaries` run ESLint, TypeScript, and layering checks.
- `npm run test:run` runs frontend Vitest tests; `npm run test` starts watch mode and `npm run test:coverage` writes reports.
- `npm run test:wrangler` runs Worker integration tests.
- `cd cloudflare-worker && npm run dev` runs the Worker locally.
- `cd cloudflare-worker && npx tsc -p tsconfig.json --noEmit` type-checks Worker code.
- `npm run deploy` builds `dist/` and deploys the Worker with its Assets and D1 binding.

### Wrangler 部署

部署 Cloudflare Worker 时必须使用 `--keep-vars`，保留 Cloudflare 中已有的环境变量，避免部署配置覆盖或删除它们。部署前按需执行 `cd cloudflare-worker && npx wrangler d1 migrations apply github-stars-manager --remote`，再使用根目录的 `npm run deploy`，或执行 `cd cloudflare-worker && npx wrangler deploy --config=wrangler.toml --keep-vars`。

`GITHUB_TOKEN` 必须使用 `npx wrangler secret put GITHUB_TOKEN` 配置为 Worker Secret。不要把线上 Secret 写入仓库。

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, single quotes, semicolons, and the existing ESLint configuration. Use `PascalCase` for React components, `camelCase` for functions/variables, and descriptive `*.test.ts` or `*.test.tsx` names. Keep application commands pure; put service calls in feature hooks or services. Frontend API calls must use the existing Worker adapter and preserve browser-direct fallback where supported.

## Testing Guidelines

Frontend tests use Vitest; frontend UI tests use Testing Library with `jsdom`. Add focused tests for behavior changes, colocated with the implementation or under a feature’s `__tests__/` directory. No coverage threshold is enforced, but run coverage for substantial changes.

## Commit & Pull Request Guidelines

Follow the repository’s Conventional Commit style, such as `fix: repair sync failure`, `feat: add repository filters`, or `chore: update version`. Keep commits focused. PRs should explain the behavior change, link issues when applicable, list validation commands, and include screenshots/recordings for UI changes. Call out configuration, migration, or deployment impact.

## Security & Configuration Tips

Never commit API keys, tokens, encryption keys, database files, or local `.env` files. Use Worker Secrets and D1 migrations as documented. Review `README.md` and `cloudflare-worker/README.md` before changing deployment configuration; do not modify or delete existing production D1 data.
