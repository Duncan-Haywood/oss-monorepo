# D1 bind-limit audit of the bet Workers (2026-11-28)

Perf track, following item 1 of "Not changed" in
`seller-books-worker-tests-perf-2026-11-28.md`: audit every `inArray(` in
`ventures/*/apps/*/src/worker` for a list a customer can grow past D1's limit
of 100 bound parameters a statement. Past it, D1 refuses the statement and
the request returns a 500.

## Method

`grep -rn "inArray(" ventures/*/apps/*/src/worker --include=*.ts` gave 72
call sites across payapps, jobshop-quote, cmmc and seller-books. For each, I
traced where the list comes from and what caps it: a zod `.max()`, a constant
like `MAX_PROVIDERS_PER_ORG`, a fixed enum, or an existing slice loop. A site
counted as a bug only if the cap allows more than ~98 values (100 minus the
org id and any other bindings). Each one was then reproduced in the Workers
runtime (Miniflare's local D1 enforces the same limit) before it was fixed.

## Found and fixed (each reproduced as a 500 first)

| app | where | how a customer reaches it | test |
|---|---|---|---|
| seller-books | `routes/org/sales.ts`, `GET /sales`: fees for every sale on the page in one `IN (...)` | **Any seller with 100+ sales.** The default page fetches 101 rows and the import screen asks for `limit=500`; both bind one id a row. | `test/worker/d1-bind-limit.test.ts`, 150 sales |
| seller-books | `services/importers/inventory-store.ts`: marks an order's units sold in one `IN (...)` | An order for 99+ units of one SKU, then a sourcing sheet with those units (the sheet allows 500 a row). It failed *after* the sale was linked, leaving the link without its items marked sold. | same file, one 120-unit order |
| cmmc | `services/service-providers/index.ts`, `linkedFiles`: every provider's two evidence files in one `IN (...)` | 50+ service providers with both files linked (the list allows 200). | `test/worker/service-providers.test.ts`, 51 providers |

Each fix slices the list (90 a statement, the same size as PayApps'
`db/in-chunks.ts`) and runs the slices one after another. Output is the
same: every id sits in exactly one slice, and callers group by id. The sales
list also groups fees with a `Map` instead of filtering the whole fee list
once per sale (501 x fees comparisons on a full page).

Verification (4-core cloud container, `pnpm test:worker` in each app):
seller-books 174/174 (wall 11.1 s), cmmc 166/166 (wall 15.1 s); `pnpm
typecheck` clean in both. Before the fixes, the three new tests failed with
the D1 error in the log (`Failed query: ... in (?, ?, ...)`).

## Checked and left alone (capped below the limit)

- jobshop-quote: `shopRoutingIds` (`MAX_LINE_ROUTINGS = 20`), stale RFQ parts
  (extraction `.max(50)`), part-history files (`MAX_PART_HISTORY`), customer
  link senders (people who emailed one quote), admin owners (already sliced).
- payapps: T&M tickets per change order (`MAX_TM_PER_CHANGE_ORDER`),
  timesheet jobs and lines (`MAX_ROWS_PER_WORKER_WEEK = 20`), alternates and
  QBO sync (already sliced).
- seller-books: receipts, expenses, mileage, books service (already sliced);
  sale lookups by one order id (a handful of rows).
- cmmc: quality, billing, reminders (fixed enums).

## Not changed (ranked, for the next run)

1. **PayApps `payments.ts` owner-paid update**: one id per pay app on a
   project. A monthly-billed job reaches 98 only after eight years; slice it
   if long jobs show up.
2. **jobshop-quote RFQ geometry link** (`rfq/index.ts`, `link`): unbounded
   hand-added parts that all match one geometry file. Unlikely, not capped.
3. **A lint rule**: a small script flagging `inArray(col, <identifier>)` with
   no `.slice(` or `chunk` in scope would catch the next one in CI. Only worth
   it if a fourth instance turns up.
4. `einvoice-pro` writes raw SQL, not Drizzle: its two `IN (...)` statements
   in `pro/sql-store.mjs` already run per slice (`part`). `residential-takeoff`
   has no Worker D1 code yet. Recheck both when they grow one.
