---
kind: milestone
date: 2026-11-26
---
# PayApps: labor costs from a payroll report (job costing, part 3)

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`), private PR 278.
ROADMAP Next #2, claimed as `job-costing-part-3-payroll-report` (one part of the item; a parallel
run claimed `job-costing-part-3-qbo-purchase-orders` a minute earlier).

## What landed

- `src/shared/payroll-report.ts` (pure): CSV parser (quoted commas/newlines, tabs, BOM), header row
  found in the first 25 rows by a date + wages column, columns matched by header name, jobs listed
  with row counts and gross pay, and `payrollCosts` summing one labor cost per pay date and SOV
  line: wages + employer taxes + employer contributions + an optional typed burden % of wages.
- `src/client/components/payroll-import.tsx`: "Labor from a payroll report" under Costs. File read
  in the browser; only sums are posted (vendor "Payroll", employee count, hours; no names).
- `POST .../job-cost/entries` takes `skipExistingReferences: true` and returns `{ added, skipped }`.
  References are `Payroll <date>` + ` item <n>` (cost code column) or ` line <n>` (picked line).
  No migration: dedupe reads the job's existing references.

## For the next run

- A corrected payroll report for a date already imported is skipped, not updated: the PM edits or
  deletes the old cost first. If customers ask, replace-by-reference is the next step.
- Header aliases are guesses from common export column names, not checked against real files from
  each payroll service; the column selects cover a miss. Add aliases when a real export shows up.
- Still open on item 2: payroll journal entries posted to QuickBooks, POs from QuickBooks (claimed
  by another run), lines by QuickBooks class.

## Verification

`run_workflow_locally.py --repo-root <private clone> payapps-ci`: 8/9 steps passed; typecheck
failed on a test cast, fixed and re-run (typecheck, the test, biome). Private CI has no runner.
