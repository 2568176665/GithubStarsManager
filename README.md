# GitHub Stars Manager

GitHub Stars Manager is a Vite + React application for organizing starred repositories with AI classification, full-text and vector search, repository Q&A, release tracking, WebDAV backup, and optional aria2 RPC downloads.

## Architecture

This project is deployed only as a Cloudflare Worker:

- Vite builds the frontend into `dist/`.
- The Worker serves the SPA and all `/api/*` routes.
- Cloudflare D1 stores synchronized application state.
- `GITHUB_TOKEN` is a Worker Secret used for the managed GitHub session and GitHub API proxy.
- AI, WebDAV, vector search, and RPC settings are configured in the application and synchronized to D1 where supported.

There is no separate server, desktop shell, container image, or reverse proxy in the supported deployment.

## Quick start

Install dependencies and start the frontend locally:

```bash
npm ci
npm run dev
```

Build the frontend:

```bash
npm run build
```

Run the Worker locally from its directory:

```bash
cd cloudflare-worker
npm ci
npm run dev
```

## Deploy to Cloudflare

1. Create or select the D1 database configured in `cloudflare-worker/wrangler.toml`.
2. Apply the existing migrations:

   ```bash
   cd cloudflare-worker
   npx wrangler d1 migrations apply github-stars-manager --remote
   ```

3. Configure the GitHub credential as a Worker Secret:

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```

4. Deploy from the repository root:

   ```bash
   npm run deploy
   ```

The Worker deploy script always uses `--keep-vars` so existing Cloudflare variables are preserved. See [`cloudflare-worker/README.md`](cloudflare-worker/README.md) for the full deployment and migration notes.

## Supported API areas

The Worker keeps the existing `/api/*` contract, including:

- `/api/health` and `/api/session`
- GitHub and AI proxy routes
- D1 synchronization for repositories, releases, settings, and service configurations
- aria2 RPC testing and Release download forwarding
- SPA static asset fallback

The frontend keeps local cache and browser-direct fallback behavior when the Worker is temporarily unavailable. Production deployments should use the Worker as the only application entry point.

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

Do not commit tokens, API keys, local `.env` files, D1 databases, or generated deployment state. Use Wrangler Secrets for `GITHUB_TOKEN`, and keep the required `--keep-vars` flag on every deployment.
