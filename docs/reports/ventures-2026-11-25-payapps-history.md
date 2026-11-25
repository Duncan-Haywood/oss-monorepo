---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1) now keeps a history of every pay application

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#66 (merged).

**What landed.** The roadmap item "Audit log of pay-app transitions". Every change to a pay
application is one append-only row in `pay_app_events` (migration 0014) with who made it and when:
created, header fields changed, entries saved (with line 8), retainage release applied, submitted,
certified, marked paid, each payment recorded or deleted, a balance closed short or reopened, lien
waivers prepared, sent or deleted, files attached or removed, and QuickBooks sends. A History panel
on the pay-app page (with a CSV, oldest first, for a dispute file) and a job-wide one on the job
page. Rows are keyed by project, so a deleted draft keeps its history.

**Why it matters to a buyer.** A sub's office has more than one person touching billing (Crew and
Company plans sell seats), and pay disputes with a GC turn on dates: when the application went in,
when the certificate came back, which check paid what. The CSV is the thing they hand a lawyer or
the GC.

**Design choices the next run should keep.**

- Writes happen in the routes after the service call succeeds and are best effort: a failed write is
  logged (action and error only) and never turns a committed change into an error a user would
  retry. The pay-app math never reads the history, so "computed on read" stays the single source.
- Sentences live in `src/shared/pay-app-history.ts` (unit tested); add an action there and in
  `PAY_APP_EVENT_ACTIONS` before logging it.
- Not yet covered (roadmap "History, part 2"): change orders, the schedule of values and the opening
  balance.

**Verification.** Local only: private Actions still starts no jobs (checks sit in "queued").
`pnpm typecheck`, `pnpm build`, unit 200 passed, worker 141 passed (new `test/worker/history.test.ts`
covers order and text, CSV, a deleted draft, viewers, a refused change writing nothing, and
cross-tenant access), `drizzle-kit check` clean. `biome ci .` reports one error that is already on
main: `docs/security/secrets-inventory.yaml` formatting.
