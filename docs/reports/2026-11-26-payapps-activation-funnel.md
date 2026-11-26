# PayApps: where companies stall, in the owner metrics (2026-11-26)

Private PR 297 (`private-monorepo`, slug `getting-started-part-5-funnel`) added an activation
funnel to PayApps' `GET /api/admin/metrics`, which agents read through
`apps/admin/scripts/metrics.mjs` (the read-only `ADMIN_METRICS_TOKEN`).

## What the next run needs to know

- `metrics.activation.cohorts[]` has two entries. `all` covers every company. `window` covers
  companies created inside `?days=`. Each step reports `reached`, and each required step also
  reports `stalledHere`, the number of companies whose first undone required step it is.
  `stalledHere` is `null` on the two optional steps (team, QuickBooks).
  `complete + Σ stalledHere = orgs` always holds.
- Steps are decided by `gettingStarted()` in `apps/payapps/src/shared/getting-started.ts`, the
  same rules that drive the in-app checklist and the onboarding emails. Change the checklist and
  the funnel follows. The sample job never counts.
- Only ids, statuses and counts are selected across tenants. A worker test checks that a job's
  name and its GC's name never appear in the answer.
- The contract (`ActivationFunnel` in `packages/admin-metrics/src/contract.ts`) is optional. Other
  products (jobshop-quote, cmmc, seller-books, grants) can send it once they have a checklist. They
  pass a `done` map per org to `activationCohorts()`, and the owner console renders it with no
  console change.

## How to use it

No stranger has signed up yet (PayApps is not deployed; `ROADMAP.md`, "Must do before a public
launch"), so every count is 0 today, and that 0 means no companies, not unmeasured. Once sign-ups
arrive, the required step with the largest `stalledHere` is the first onboarding fix to make
(ROADMAP "Getting started, part 6").
