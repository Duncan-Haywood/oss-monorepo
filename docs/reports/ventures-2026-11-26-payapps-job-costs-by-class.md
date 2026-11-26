---
kind: milestone
date: 2026-11-26
---
# PayApps: job costs from QuickBooks read by class (private PR, job-costing-part-3-by-class)

Date: 2026-11-26. ROADMAP item "Job costing, part 3: lines picked by class" in
`private-monorepo/apps/payapps`, the last open part of job costing part 3.

## What landed

- `packages/qbo-sync` (private) `costs.ts`: `ExpenseQuery.classIds`. A line matches on its
  `CustomerRef` or its `ClassRef` (expense-line, item-line and journal-line details); a purchase
  order line with no class takes the order's own `ClassRef`. `ExpenseLine.customerId` is now
  optional and `classId` is new. The fake takes `classId` on bill, journal and PO lines (and on the
  PO itself).
- payapps: `GET .../job-cost/quickbooks/classes` (with `jobClassId`, the job's invoice class from
  QuickBooks part 7), `PUT .../link {classId}`, and a "Costs tagged by: Customer or job / Class"
  picker. Migration 0054 adds `job_cost_qbo_links.match_by` (default "customer"); the old
  `customer_id`/`customer_name` columns hold the class's id and name for a class link (the drizzle
  properties are now `refId`/`refName`). The link DTO is `{ by, id, name }` everywhere, and the lines
  DTOs carry `link` in place of `customerName`.

## What the next run should know

- **Sources.** Field names come from the PHP SDK's `src/Data/IPP*.php` on raw.githubusercontent.com
  (developer.intuit.com gives nothing to curl). Bill, Purchase and VendorCredit declare no
  transaction-level `ClassRef`, so classes are read per line; whether "one class per transaction"
  companies really get the class on each expense line in the API is unconfirmed until a sandbox
  company exists (owner: an Intuit developer app).
- Only the exact class is read, not its sub-classes (the same rule as customers). Reading a class
  with its sub-classes is the "if people ask" follow-up in the ROADMAP.
