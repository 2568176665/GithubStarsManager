# GitHub Stars Manager

A browser-first app for organizing, rediscovering, and following GitHub starred repositories. The production app is served by one Cloudflare Worker; it keeps the browser cache and direct GitHub fallback used by the frontend.

## Project direction

- Keep the product focused on managing GitHub stars in the browser.
- Deploy the Vite + React frontend and `/api/*` endpoints together on Cloudflare Workers, with D1 for synchronized app state.
- Preserve local-cache and browser-direct fallback behavior.
- Keep AI, Vectorize search, WebDAV backup, and aria2 integration optional.
- Keep this fork Worker-only: no separately deployed server, desktop app, container, or reverse proxy.

## What you can do

- Organize starred repositories and write categories to GitHub Lists.
- Discover repositories through configurable channels and star repositories from pasted links, Markdown, `owner/repo` entries, or JSON.
- Track Releases with keyword and repository include/exclude rules.
- Search repositories, with FTS5 as the Worker search path and Vectorize as an optional enhancement.
- Add optional AI-assisted workflows, WebDAV backup, and aria2 downloads when configured.

## Architecture

- `src/` — Vite + React browser app and its local cache.
- `cloudflare-worker/` — Worker SPA entry point, `/api/*` routes, Wrangler config, and D1 migrations.
- `GITHUB_TOKEN` — Worker Secret used for the managed GitHub session and GitHub API proxy.
- D1 — synchronized repositories, Releases, settings, and service configuration.

The Worker is the only supported production entry point. Keep existing API contracts and browser fallback behavior when changing the frontend or Worker.

## Local development

```bash
npm ci
npm run dev
```

To run the Worker locally:

```bash
cd cloudflare-worker
npm ci
npm run dev
```

## Deploy to Cloudflare

Configure the D1 database in `cloudflare-worker/wrangler.toml` and set `GITHUB_TOKEN` as a Worker Secret when setting up a new environment. Apply D1 migrations only when there are unapplied schema changes:

```bash
cd cloudflare-worker
npx wrangler d1 migrations apply github-stars-manager --remote
npx wrangler secret put GITHUB_TOKEN
```

Deploy from the repository root:

```bash
npm run deploy
```

The deploy script builds the frontend and runs Wrangler with `--keep-vars` to preserve Cloudflare dashboard variables. See [`cloudflare-worker/README.md`](cloudflare-worker/README.md) for Worker setup details.

## Validation

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

## Security

Never commit tokens, API keys, `.env` files, D1 data, or generated deployment state. Use Wrangler Secrets for `GITHUB_TOKEN`, and keep `--keep-vars` on every deployment.
