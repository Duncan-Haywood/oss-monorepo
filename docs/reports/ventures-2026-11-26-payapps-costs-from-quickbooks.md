---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): job costs read from QuickBooks

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#277. ROADMAP Next #2,
"Job costing, part 2: costs from QuickBooks"; claim `claim/payapps/job-costing-part-2-qbo-costs`.
Builds on job costing part 1 (private PR 267), cost to complete (270) and committed costs (271).

**What landed.**
- `packages/qbo-sync/src/costs.ts`: `JobCostReader` (`listCustomers`, `listExpenseLines`),
  reached with `costReaderFor(books)`, so `qbo.ts`, `fake.ts` and the `AccountingSync` port are
  unchanged. QBO reader pages `select * from Bill|Purchase|VendorCredit where TxnDate >= … and
  TxnDate <= … startposition N maxresults 1000` (10 pages max per entity, then `truncated`).
  Lines match on `AccountBasedExpenseLineDetail`/`ItemBasedExpenseLineDetail.CustomerRef`, exact
  customer only (not sub-customers). VendorCredit and Purchase with `Credit: true` are negative.
  Field names from Intuit's PHP SDK classes (read 2026-11-26). `FakeCostBook` via `fakeCosts(books)`
  seeds customers and expenses for tests and the demo.
- payapps: `job_cost_qbo_links` (one per job, with the realm), `job_cost_entries.qbo_source`
  (`<realm>:<type>:<txn>:<line>`, unique per org), migration 0051. Routes under
  `.../projects/:projectId/job-cost/quickbooks`: `GET /`, `GET /customers`, `PUT /link`,
  `GET /lines?from&to` (2-year cap), `POST /import` (re-reads QBO, 409 if any picked line is gone,
  `onConflictDoNothing` against the unique index). UI card "Costs from QuickBooks" on the job-cost
  page; imported costs say "from QuickBooks (Bill INV-…)".
- Privacy policy 2026-11-26.11; QUICKBOOKS.md "Job costs from QuickBooks"; payapps-site copy;
  the customer post gained a paragraph.

**What the next run should know.**
- PR #274 (QuickBooks class/location per job, another session) also wanted migration 0051; whichever
  lands second renumbers. Class tracking could later pick lines by `ClassRef` for companies that
  track jobs by class instead of customer (ROADMAP part 3).
- Payroll: QuickBooks Payroll paychecks are not an Accounting API entity. Payroll services that
  post a journal entry per job (`JournalEntryLineDetail.Entity`) are the readable path.
- `PurchaseOrder` could fill the commitments table the same way (same reader pattern).
- Not yet run against an Intuit sandbox; `packages/qbo-sync/README.md` lists what to check.
