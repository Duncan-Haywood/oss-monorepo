---
kind: milestone
date: 2026-11-26
---
# PayApps: the WIP schedule as a PDF (job costing, part 2)

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`), private PR 269.
ROADMAP Next #2, claimed as `job-costing-part-2-wip-pdf` (one part of the item).

## What landed

- `GET /api/orgs/:orgId/reports/wip.pdf`, linked as "PDF for your surety or bank" on
  `/orgs/:orgId/wip`. Readable on every plan, like the screen and the CSV; viewers too.
- `src/worker/services/export/wip-pdf.ts`: US Letter landscape on the in-house PDF writer
  (`export/pdf.ts`, no dependency). Columns: contract to date, est. cost at completion, est. gross
  profit, cost to date, percent complete, earned revenue, billed to date, over billed, under billed,
  cost to complete, revenue to earn. Each job shows its billed-through application and period end.
- Totals (`wipTotals`) cover only jobs whose estimate is complete, matching the report's own
  totals; total percent complete = total cost / total estimate. The only figures not already in
  `wipReport` are sums and backlog (contract - earned).
- A job with lines missing a budget prints a one-line note (contract, cost, billing) and is left
  out of the totals. Last page: a blank review block (name, title, date, signature) for the
  company. Every page: the "working schedule, not financial statements, an audit or a review"
  notice and page numbers.

## Verification

Unit `test/unit/wip-pdf.test.ts` (hand-worked totals, multi-page, empty), worker
`test/worker/job-cost.test.ts` (download, viewer 200, other company 404), typecheck, biome, and a
pdftoppm render checked by eye. Private CI had no runner (`ci_starvation.py`: runner_id 0), so
`run_workflow_locally.py --repo-root <private clone> payapps-ci` was run instead.

## Not done, on purpose

- No surety's own form is copied; layouts vary by surety and ours is generic.
- A parallel run merged the PM's cost to complete per line (private PR 270,
  `job-costing-part-2-cost-to-complete`) while this was in review. It feeds `wipReport`, so the PDF
  uses it with no change; this PR only merged main in and prints "N lines re-estimated by the PM"
  under a job that uses it (`totals.costToCompleteLines`).

## For the next run

ROADMAP Next #2 still holds two parts: costs from QuickBooks (bills, checks, payroll by
customer/job) and committed costs (POs, lower-tier subcontracts) in the estimate. Committed costs
are the smaller one and change the estimate a surety reads.
