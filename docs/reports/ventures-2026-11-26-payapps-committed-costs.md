---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): committed costs, POs and subcontracts in the estimate

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#271. ROADMAP Next #2,
"Job costing, part 2"; claim `claim/payapps/job-costing-part-2-committed-costs`. Builds on part 1
(private PR 267) and the cost to complete (private PR 270).

**What landed.**
- `src/shared/job-cost.ts`: optional `commitments` input (`id`, `sovLineId`, `committedOn`,
  `amountCents`) and `commitmentId` on cost entries. Open = max(0, amount − costs to date against
  it). Each line's EAC = max(its budget or cost-to-complete EAC, cost to date + open commitments),
  basis `committed` when the floor wins, with issue `committed_over_estimate_line`. Open amounts on
  no line add to the job's EAC. Over-invoiced: issue `commitment_over_invoiced`, open 0, never
  lowers the estimate. Commitments dated after as-of are left out. A commitment does not stand in
  for a missing budget (the estimate still waits). Report gains `commitments[]` status, per-line
  `committedCents`/`openCommittedCents`, totals of both.
- Migration 0050: `job_cost_commitments` and `job_cost_entries.commitment_id` (drizzle-kit dropped
  `ON DELETE set null` on the ALTER; added by hand; delete also nulls the links in the same batch).
- Routes `POST/PATCH/DELETE .../job-cost/commitments[/:id]`; entries accept `commitmentId`, checked
  to belong to the same job (400 otherwise; another job's id through this path is 404).
- UI section "Purchase orders and subcontracts" on the job-cost page; "Against" picker on costs.
  CSV: two columns per line, a commitments section, the commitment on each cost.
- Privacy policy 2026-11-26.10; payapps-site bullet; the customer post gained a section with the
  test's worked example ($40,000 line, $30,000 budget, $35,000 sub, $10,000 invoiced).

**What the next run should know.**
- The WIP PDF (`job-costing-part-2-wip-pdf`, another run) reads `report.totals`, so it gets the
  committed floor for free; a column for open commitments would help a surety.
- Purchase orders from QuickBooks (`PurchaseOrder` entity) would fill this table without typing,
  once the costs-from-QuickBooks part is built.
- No paste import for commitments yet; add one if users have more than a handful per job.
