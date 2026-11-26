---
kind: milestone
date: 2026-11-26
---
# PayApps: payroll journal entries from QuickBooks as job costs (job costing, part 3)

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`), private PR 284.
ROADMAP Next #2, claimed as `job-costing-part-3-qbo-journal-entries`, one part of the item. The
other parts were already done: the payroll report upload (PR 278) and purchase orders.

## What landed

- `packages/qbo-sync/src/costs.ts`: `listExpenseLines` now also pages `JournalEntry`. A line
  counts when `JournalEntryLineDetail.Entity.Type` is `Customer` or `Job`, its `EntityRef` is the
  linked customer, and its `AccountRef` is a cost account: `Classification` "Expense", or an
  `AccountType` of Expense, Cost of Goods Sold or Other Expense. A debit is a cost and a credit is
  negative. `select * from Account` is read only when an entry in the window names the job.
  The fake has `addJournalEntry`, and new accounts default to Expense.
- payapps: txn type `JournalEntry` is labelled "Journal entry", with reference
  `Journal entry <DocNumber>`. The source key, the never-twice index and the 409 path are
  unchanged, and no migration was needed.

## Sources

The field names come from Intuit's PHP SDK `src/Data/IPPJournalEntryLineDetail.php`,
`IPPEntityTypeRef.php` and `IPPAccount.php`. The enum values come from
`ipp-v3-java-data/src/main/xsd/Finance.xsd` in Intuit's Java SDK: `AccountClassificationEnum`,
`AccountTypeEnum`, `EntityTypeEnum` (Customer, Employee, Job, Other, Vendor) and
`PostingTypeEnum`. Both were read through raw.githubusercontent.com on 2026-11-26.

## For the next run

- The only part of item 2 still open is picking lines by QuickBooks class, for companies that
  track jobs by class instead of customer. `JournalEntryLineDetail` carries `ClassRef`, and so do
  the expense line details.
- `select * from Account` returns active accounts only (unverified), so a journal line on an
  account made inactive since is dropped. Querying `Active in (true, false)` would fix that, but
  the syntax has not been checked against a sandbox.
- Labor from a journal entry and labor from the payroll report would double count. The page and
  the docs say to use one source. A per-job guard is possible if people hit it.

## Verification

qbo-sync `pnpm test` 82/82 and typecheck clean. payapps typecheck, `test:unit` and the full
`test:worker` suite were run locally (the result is in the run record), and biome is clean. The
risk review blocked nothing.
