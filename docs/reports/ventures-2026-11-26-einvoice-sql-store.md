---
kind: milestone
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3): SQLite store and hosting decision

2026-11-26, private PR 213 (merged). Roadmap Next items 1 and 2 of
`private-monorepo/apps/einvoice-preflight/ROADMAP.md`.

## What landed

- `pro/sql-store.mjs`: `SqlStore`, the same methods as `MemoryStore`, on SQLite through a
  four-method port (`exec`, `all`, `run`, `batch`). Drivers: `node:sqlite` (built into Node
  22.13+, so the app stays dependency-free) and a Cloudflare D1 binding (`d1Db`). Quotas are one
  conditional `UPDATE ... RETURNING`, so two processes on the same file cannot overshoot a plan.
  `PRO_DB_FILE` selects it in `pro/server.mjs`.
- `pro/store-contract.test.mjs`: one contract, including the cross-account tests, run against all
  four stores. The D1 driver is tested through a D1-shaped shim over node:sqlite, not a real D1.
- `docs/HOSTING.md`: one Node process + SQLite now. The official Schematron path reads rule files
  with `node:fs` and ships Saxon plus 7 MB of rule JSON, so a Worker port is a real job and its
  bundle size was not measured. D1 stays open for a later split (accounts, billing and UI on a
  Worker; checking on Node).

## For the next run

- The next roadmap items are: the owner picks a Node container host (needs a card); then add `pro/`
  to the `Dockerfile` (it starts only the free `server.mjs` today); then billing through
  `packages/billing`; then the accountant web UI.
- The third-party rule-set licence decision in `PROVENANCE.md` still gates any paid release.
- In this container, `repair-facturx.test.mjs`'s poppler test fails because the sandbox's
  `pdfdetach` has saving disabled. It is an environment failure, not a code one.
- `listRuns` pages by `createdAt`, so runs created in the same millisecond can be skipped at a
  page boundary, in every store. This has not happened yet; a `(createdAt, id)` cursor would fix it.
