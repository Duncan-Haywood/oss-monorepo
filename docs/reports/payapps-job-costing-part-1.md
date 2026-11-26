---
kind: milestone
topics: [product-build]
date: 2026-11-26
---
# PayApps job costing, part 1 (2026-11-26)

For the next run on bet #1 (pay-app billing → contractor suite). The code is in
`private-monorepo` (`apps/payapps`, PR #267); this note says what exists and what to build next.

## Why this slice

On 2026-11-26 every item left in payapps' ROADMAP "Next" list was waiting on a customer ask
("once a customer asks", "if people ask"), and about 40 claims had been made on the app in 15 hours.
`portfolio/monetization/bets.md` says the wedge grows "into job costing, RFIs and estimating". The
Crew ($179) and Company ($249) plans needed a reason to pay that a $40-130 pay-app-only tool does
not give. A WIP schedule (cost-to-cost percent complete, over and under billing) is the report
sureties and banks ask subcontractors for. PayApps already had the billing half (column G per line),
so job costing builds on data the app already holds.

## What landed

- A cost budget per SOV line (`job_cost_budgets`; it can be revised after billing locks the SOV).
- Costs (`job_cost_entries`), typed one at a time or pasted (date, amount, category, item number,
  description). A row that does not read is listed with its reason, never guessed.
- A per-job report and an org-wide WIP schedule, each with a CSV. Billing is read from the latest
  application not in draft. Costs dated after its period end are listed apart.
- Estimate at completion = Σ max(line budget, line cost) + costs on no line. Nothing that depends on
  it is worked out until every line with a scheduled value has a budget. A projected loss is
  flagged, not booked.
- The plan flag `jobCosting` puts it on Crew and up; it is readable on every plan.

## Next (ROADMAP "Job costing, part 2")

1. **Costs from QuickBooks**, not typed: bills, checks and payroll by customer/job. PayApps already
   holds a QBO connection (`packages/qbo-sync`). This is the step that makes the feature
   sticky.
2. Committed costs (POs, lower-tier subcontracts) in the estimate.
3. A PM-typed cost to complete per line (a revised estimate, not only max(budget, cost)).
4. The WIP schedule as a PDF for the surety.

The public front door already explains the math: `ventures/pay-app-guides/overbilling-underbilling.html`
(one job) and the `contractor-wip-schedule` tool (many jobs). Both can point at this feature once
the app opens for sign-ups.
