# Repository Guidelines

这个fork仓库是专门用来部署 Cloudflare Worker 的，只保留前端（`src/`）和 Worker（`cloudflare-worker/`）代码。

## Project Structure & Module Organization

- `src/` contains the Vite React/TypeScript frontend: components, feature logic, Zustand state, services, utilities, and types are grouped by directory.
- `cloudflare-worker/` contains the Worker, API routes, and D1 migrations.
- Put static assets in `public/` or `assets/`, documentation/ADRs in `docs/`, and treat `dist/` as generated output.

## Build, Test, and Development Commands

Run `npm install` at the repository root first.

- `npm run dev` starts Vite.
- `npm run build` creates the frontend bundle and checks size limits.
- `npm run lint`, `npm run typecheck`, and `npm run check:boundaries` run ESLint, TypeScript, and layering checks.
- `npm run test:run` runs frontend Vitest tests; `npm run test` starts watch mode and `npm run test:coverage` writes reports.
- `cd cloudflare-worker && npm run dev` runs the Worker locally; deploy with `npm run deploy` only when needed.

### Wrangler 部署

部署 Cloudflare Worker 时必须使用 `--keep-vars`，保留 Cloudflare 中已有的环境变量，避免部署配置覆盖或删除它们。例如：`cd cloudflare-worker && npx wrangler deploy --config=wrangler.toml --keep-vars`。

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, single quotes, semicolons, and the existing ESLint configuration. Use `PascalCase` for React components, `camelCase` for functions/variables, and descriptive `*.test.ts` or `*.test.tsx` names. Keep application commands pure; put service calls in feature hooks or services. Follow `docs/adr/0001-frontend-layering.md`.

## Testing Guidelines

Frontend tests use Vitest; frontend UI tests use Testing Library with `jsdom`. Add focused tests for behavior changes, colocated with the implementation or under a feature’s `__tests__/` directory. No coverage threshold is enforced, but run coverage for substantial changes.

## Commit & Pull Request Guidelines

Follow the repository’s Conventional Commit style, such as `fix: repair sync failure`, `feat: add repository filters`, or `chore: update version`. Keep commits focused. PRs should explain the behavior change, link issues when applicable, list validation commands, and include screenshots/recordings for UI changes. Call out configuration, migration, or deployment impact.

## Security & Configuration Tips

Never commit API keys, tokens, encryption keys, database files, or local `.env` files. Use documented environment examples and test proxy/auth changes. Review `README.md` and Worker docs before changing deployment configuration.
