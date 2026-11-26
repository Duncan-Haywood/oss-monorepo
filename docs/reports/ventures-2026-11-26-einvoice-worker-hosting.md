---
kind: milestone
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3): the paid layer runs on Cloudflare Workers, so hosting needs no new card

2026-11-26, private PR 302 (`private-monorepo/apps/einvoice-preflight`). Roadmap Next item 1.

## Why

The paid layer could only run as a Node container, and roadmap item 1 was waiting on "the owner
picks a Node container host (needs a card)". The earlier decision (`docs/HOSTING.md`, this
morning; `ventures-2026-11-26-einvoice-sql-store.md`) left the Worker route unmeasured. Grant
Autopilot already requires Workers Paid on the owner's Cloudflare account
(`apps/grants/docs/DEPLOY.md`), so a Worker port removes that owner step completely.

## What landed

- `worker/index.mjs` runs the same `createProHandler` through `pro/fetch-adapter.mjs`. The
  `SqlStore` runs on D1, and the official rules run on the plain route (fontoxpath + slimdom).
  `worker/build.mjs` embeds the rule sets, the legal texts and the fonts. `pro/app-files.mjs` is
  the only seam (it reads from disk on Node and from the embedded copy in the Worker).
  `plain-node.mjs` gained `configurePlain()`. The entry lives in `worker/` because `pro/` must
  not import npm modules (`pro/rules-diff.test.mjs`).
- Measured in local workerd: **42 of 42 example files return byte-identical JSON** from the Node
  host and the Worker (`eval/worker-parity.mjs`). The bundle is 2.0 MB gzipped. Each invoice
  takes 40-440 ms of CPU, which rules out the free plan's 10 ms but fits Workers Paid.

## For the next run

- Roadmap item 1, remaining work:
  - a manual deploy workflow modelled on `payapps-deploy.yml` (create the D1 database, write its
    id into the config, sync secrets);
  - name Cloudflare as a subprocessor in the privacy page and the DPA before the first deploy;
  - re-read the CPU figures from Workers Metrics after that deploy.
- Sign-up caps are kept in memory, so on Workers they apply per isolate. Back them with D1 if
  trials get abused.
- `wrangler dev` needs `npm i --no-save slimdom@4.3.5 && node worker/build.mjs` first. wrangler
  4.165.0 is in `apps/jobshop-quote/node_modules/.bin` after a filtered `pnpm install`.
