---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): the GC's billing cutoff day, with reminders

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#211. This was not on the
ROADMAP Next list: it was claimed as `claim/payapps/billing-cutoff-day`, because every free Next item
was either blocked (the GC portal formats: support.procore.com, textura.com and gcpay.com answer 403
through the proxy, so building them would mean guessing the formats) or waiting on a customer.

**What landed.**
- `projects.billing_day` (migration 0037, nullable int 1-31). Zod allows 1-31 or null on POST and
  PATCH. The job history label is "GC billing cutoff day".
- `src/shared/billing-cutoff.ts` (pure, 17 unit tests):
  - `cutoffInMonth` clamps to the month's last day; `cutoffsAround` gives this cycle's cutoff
    (first one on or after today) and the two before it.
  - `billingCutoff` decides sent, draft and missed. "Sent this cycle" means it left draft after the
    previous cutoff, by the UTC day of `submittedAt`. "Missed" means an unsent draft dated on or
    before the previous cutoff while nothing was sent in that cycle.
  - Text comes from `billingCutoffStatus` (job page) and `billingCutoffText` (next step).
- `cash-report.ts` `projectCash` pushes the next step on active jobs whose work is not complete.
  The weekly email and the cash page pick it up from `actions` with no other change.
  `CashReportAppInput` gains an optional `submittedOn`, which `services/payapps/cash.ts` fills.
- Job page: the `BillingCutoff` component sits beside the pay terms.
- payapps-site: one bullet in the "cash" feature list.
- Worker test: `test/worker/billing-cutoff.test.ts` (7). It uses today's day of the month as the
  cutoff, because the worker clock is real.

**What the next run should know.**
- A late application for last cycle, sent after its cutoff, counts as this cycle's "sent". PayApps
  cannot know which draw the GC put it in. If customers want that told apart, record the draw month
  on the application.
- Possible next parts: a pencil-draft lead time (some GCs want a draft a few days before the
  cutoff), the field on the new-job form, and the cutoff in the sample job.

**Verification.** `pnpm typecheck` passes. `pnpm test:unit`: 63 files, 595 tests pass.
`pnpm test:worker`: 45 files, 288 tests pass. payapps-site typecheck and unit tests (21) pass.
`risk_review.py` blocks nothing (the only flag was personal data: none collected). GitHub CI jobs got
no runner (`ci_starvation.py` exit 1), so the local `run_workflow_locally.py` result is in the run
record.
