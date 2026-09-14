<!--
Thank you for contributing! This fork is deployed only to Cloudflare Worker.
-->

## Summary

<!-- Brief: what changed and why. Reference the PR number from the plan if applicable. -->

## Verification

Run the following locally in this order before pushing:

```bash
npm run check:boundaries   # frontend layering guard (offline, fast)
npm run lint               # eslint incl. no-restricted-imports boundary rules
npm run typecheck          # tsc -b --noEmit
npm run test:run           # vitest run (contract + unit tests)
npm run build              # vite build + bundle budget (<= 3000 KiB legacy entry)
git diff --check           # whitespace / merge-marker hygiene
```

CI runs the same set (see `.github/workflows/ci.yml`), with `check:boundaries` first so a
layering violation fails the job before the slower steps. Worker changes also require
the Worker typecheck and Wrangler integration test.

## Scope checklist

- [ ] **Runtime/persistence/UI changes described.** If this PR changes runtime behavior,
      persisted data (Store keys, `version`, `partialize`, `migrate`, `merge` — see
      `src/store/persistence/options.ts`), or user-visible UI, describe the
      change and its migration impact below. Architecture-enforcement PRs should have none.
- [ ] No new `import` of a business service directly into `src/components/**`
      (the ESLint `no-restricted-imports` / `no-restricted-syntax` rules and
      `check:boundaries` enforce this, including dynamic `import()`; if a component
      genuinely needs a service, add a hook in `src/features/*/hooks/**`).
- [ ] No new `import` of React/JSX/the Store/any service into `src/features/*/application/**`
      (static or dynamic).
- [ ] No inline `eslint-disable` to bypass the boundary rules — fix the layering instead.

### Runtime / persistence / UI changes (if any)

<!-- If this PR touches runtime behavior, persisted data, or UI, describe it here.
If it is a pure architecture-enforcement PR with none, write "None". -->

## Notes for reviewers / CodeRabbit

<!-- If a CodeRabbit finding is out of scope for this PR, reply on the comment with the
reason and leave it unresolved rather than expanding scope. The goal is "no new
unresolved findings", not "zero comments". -->
