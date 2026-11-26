---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): cost to complete per line, the revised estimate behind the WIP

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#270, merged. ROADMAP Next #2,
"Job costing, part 2"; claim `claim/payapps/job-costing-part-2-cost-to-complete`. Builds on job
costing part 1 (private PR 267).

**What landed.**
- `src/shared/job-cost.ts`: optional `costToCompleteCents` and `costToCompleteOn` on each line.
  With both set, the line's estimate at completion = cost on the line through that date + cost to
  complete, never below the cost to date. The estimate is the same whatever the report's as-of
  date, and costs dated after the estimate use it up. New line fields: `estimateBasis`
  (`budget` | `cost_to_complete` | `cost`), `remainingCostCents`, `estimateVsBudgetCents`. New
  totals: `estimateVsBudgetCents`, `costToCompleteLines`. New issues: `estimate_over_budget_line`
  and `cost_to_complete_used_up`. A line with a cost to complete no longer counts as missing a
  budget in the pure function. Storage still needs a budget row, so the API answers 400 without one.
- Migration 0049 adds two nullable columns on `job_cost_budgets`. In `PUT /job-cost/budgets`,
  `costToCompleteCents` left out keeps the stored figure and `null` clears it. A changed figure is
  dated today; an unchanged one keeps its date.
- The job-cost page has a second input per line ("Edit budgets and estimates") and Cost to
  complete / Estimate columns, with the line in red when the estimate is over budget. The job CSV
  gains four columns. The WIP schedule follows automatically (its totals are the report's totals).
- Privacy policy 2026-11-26.9 now names the estimates, and payapps-site has one feature bullet.
- The customer post `docs/posts/2026-11-24-pay-applications-...` gained a section with the test's
  hand-worked example ($100,000 line, $60,000 budget, $40,000 to complete: 51.43% against 60%).

**Verification.** typecheck; 16 job-cost unit tests (7 new) and 5 worker tests (1 new); then
`run_workflow_locally.py --repo-root /home/user/private-monorepo payapps-ci` (9/9 run: steps)
and `payapps-site-ci` (6/6). CI runners were starved, so the `uses:` steps did not run.

**What the next run should know.**
- The WIP PDF part (`job-costing-part-2-wip-pdf`) was claimed by another run at the same time. Its
  PDF should show the estimate basis, or at least the "re-estimated lines" count, so a surety can
  see which lines are no longer at the bid budget.
- Still open in part 2: costs from QuickBooks, and committed costs (POs, lower-tier subcontracts).
  Committed costs could set a floor under the estimate (estimate >= cost + open commitments). That
  rule belongs in `computeJobCost` next to the cost-to-complete branch.
- The date stamp is the server's UTC day (`isoDay(ctx.now())`). A PM in Hawaii saving late in the
  evening gets tomorrow's date. That is harmless unless a cost is dated that same day.
