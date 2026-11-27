# Seller Books: Architecture (v0.1)

Seller Books keeps the books for people who resell on eBay, Poshmark, Mercari, Whatnot, Depop, Etsy and Shopify.
It imports the marketplaces' own reports, splits each sale into gross, fees, postage and net, tracks cost of
goods per item and per lot, keeps a mileage log, and shows profit by platform and month. It also builds a
Schedule C **worksheet** for the seller or their preparer. Multi-tenant from day one: an org is one selling
business, and several people can share it.

It is not tax software. The Schedule C output is a worksheet of the seller's own numbers, not a return or a
filing, and nothing in the app is tax advice. The 1099-K page explains reporting thresholds. It does not
use them to frighten sellers (the federal threshold is back at over $20,000 and over 200 transactions).

## Stack (same conventions as apps/grants)

| Concern  | Choice                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------- |
| Runtime  | One Cloudflare Worker: Hono API at `/api/*` + static SPA assets                                 |
| UI       | React 19 SPA, TanStack Router (code-based routes) + TanStack Query, Tailwind 4                  |
| Data     | D1 (SQLite) via Drizzle ORM. Shared DB, every tenant row has `org_id` with `ON DELETE CASCADE` |
| Auth     | Better Auth (email + password, PBKDF2 hashing); our own org / member / invitation tables       |
| LLM      | None. No LLM call anywhere (so no `ctx.llm`/FakeLlm yet)                                        |
| Billing  | None: the paid path is dark                                                                     |
| IaC      | `wrangler.jsonc` (D1 auto-provisioned), `migrations/` from `pnpm db:generate`                  |

No new dependencies: the app uses a subset of the versions apps/grants already pins.

## Code layout (`apps/seller-books`)

```
src/shared/            enums.ts (platforms, fee kinds, expense categories), csv.ts (RFC 4180 reader/writer)
src/shared/plans.ts     plans, limits and the billing DTOs (docs/BILLING.md)
src/shared/reference/  fee-sources.ts (official fee pages, no rates), form-1099k.ts (federal + state notes)
src/worker/
  index.ts, app.ts     fetch handler; app.ts only mounts routers + renders errors
  context.ts           AppContext { env, db, logger, now, billing }
  db/schema/           auth.ts (Better Auth + org/member/invitation), books.ts (everything else)
  middleware/          context, security (headers + Origin check), session, tenant (requireOrg/requireRole)
  routes/              auth, me, orgs, invitations, reference, health; routes/org/* under /api/orgs/:orgId
  services/importers/  parse.ts (money, dates, header matching), one file per platform, store.ts (persist)
  services/billing/    service.ts (plan, limits, checkout, portal, webhook); ports/billing.ts picks Paddle or the fake
  services/books/      lots.ts, pnl.ts, schedule-c.ts (pure), service.ts (tenant-scoped DB loads);
                       the estimated-tax arithmetic is in src/shared/estimated-tax.ts (pure)
src/client/            main.tsx, router.tsx, lib/api.ts, routes/*.tsx
test/fixtures/         one authored CSV per report (see docs/IMPORTERS.md)
test/unit/             importers, parsing, P&L / Schedule C / lot math, reference-data guards
test/worker/           routes end-to-end in workerd with local D1, incl. the cross-tenant test
```

## Accounting rules

**Imports are the source of truth for fees.** Each importer maps the report's own fee columns to a fee kind
(`final_value`, `per_order`, `commission`, `payment_processing`, `advertising`...). Seller Books never computes
a fee from a percentage; `test/unit/reference.test.ts` fails if an importer does. A report can give only the
order price and the net (Poshmark does). Then the difference is stored as one `marketplace_fee`, labelled as
derived from those two columns.

**Rows.**
- `sale`: one per order line or refund, dated when it happened (cash basis). It holds item price after
  seller-funded discounts, shipping charged to the buyer, sales tax the marketplace collected (never revenue),
  postage deducted on that order, and the report's net.
- `sale_fee`: the itemised fees for a sale. Refunds carry fee credits as negative amounts.
- `platform_charge`: anything not tied to one order line, such as postage bought separately, promoted-listing
  fees, Etsy listing fees and store subscriptions.

**Re-imports are safe.** Every row gets a stable external id: the platform's transaction or order id, or else a
hash of its key cells. `(org, platform, external_id)` is unique, so importing the same file again only reports
duplicates. Deleting an import deletes its rows and puts the items its sales had sold back in stock.

**Cost of goods.**
- Every inventory item has a cost. A lot (a bin, pallet or estate-sale haul) spreads its total cost over its
  items. Typed-in costs are kept, the rest is split evenly, and leftover cents go to the first items, so the
  shares always add back up to the lot total (`services/books/lots.ts`).
- An order is linked to the items it sold (`services/books/units.ts`, since 2026-11-26): one item per unit, so
  an order for two of a SKU sells two items, each recording the order in `inventory_item.sold_by_sale_id`
  (migration 0006 backfills it for earlier links; `sale.inventory_item_id` stays as the order's first item).
  On import this happens automatically when the order's SKU (custom label) matches in-stock items, oldest
  first and only items bought on or before the sale date: an item bought later cannot be the one that sold.
  Otherwise items are linked by hand on the Sales page, one at a time up to the order's quantity, with the same
  date rule; unlinking the order, or deleting its import, puts all of them back in stock. An order with fewer
  items than units counts as missing cost. The stock report gives each unit an equal share of its order's money.
  Tests: `test/unit/units.test.ts`, `test/worker/cogs-matching.test.ts` (the 2026-11-26 quality audit's probe).
- **Sourcing sheet import** (2026-11-26, `services/importers/inventory-sheet.ts` + `inventory-store.ts`): the
  spreadsheet a seller already keeps (date bought, cost each or per row, item or SKU, optional quantity,
  status and date removed), matched by column name. Quantity N makes N items; a row total is split with the
  lot rule. A blank or unreadable cost or date skips the row with its line; "kept"/"donated"-style statuses
  need a date removed. Re-imports add only new items (same title, SKU, date and cost counted per key).
  Orders already imported without an item link to the new items by SKU, oldest first, only to an item
  bought on or before the sale date. The page previews (`dryRun`) before anything is saved.
- **P&L COGS:** the cost of the linked items, booked in the month of the sale. Orders with no linked item, or
  fewer items than units sold, are counted and flagged, because their profit is overstated.
- **Schedule C Part III:** follows the form, at cost with specific identification. Lines 35 + 36 − 41 = 42, so
  items written off also count; items taken for personal use come off line 36. Lot cost that no item carries is
  counted as a purchase and flagged.

**P&L** (`services/books/pnl.ts`):
- revenue = items + shipping charged − refunds
- gross profit = revenue − fees − postage − COGS
- net profit = gross profit − expenses

Results come per (platform, month), with roll-ups by platform, by month and in total. Expenses not tied to a
platform go in a `general` row.

**Schedule C worksheet** (`services/books/schedule-c.ts`) puts each amount on a common line:
- Line 1: items plus shipping charged, without sales tax.
- Line 2: refunds.
- Line 8: ad and promoted-listing fees.
- Line 9: standard mileage, each trip at the IRS business rate in force on the day it was driven
  (`src/shared/reference/mileage-rates.ts`, 2019 on, read from irs.gov's "Standard mileage rates" table on
  2026-11-26, with the news release it names per period), so 2022 and 2026 split at July 1. The total is
  rounded once; line 9's note and `mileagePricing` give the miles per rate. A rate the seller types in replaces
  the table for every trip (`?mileageRate=`). A trip dated after the table's last period (the next year, before
  the IRS announces it) is left out of line 9 with a warning naming its miles and dates. Add each January's
  rate to the table when the IRS publishes it.
- Line 10: other marketplace fees.
- Line 24b: 50% of meals.
- Line 27a: postage and subscriptions, listed in Part V.
- Equipment (2026-11-26, expense category `equipment`, no migration: `expense.category` is free text checked
  by the route's enum). `expenseLine` in `schedule-c.ts` splits it by price: $2,500 or less a row is its own
  line 27a row, "Equipment expensed under the de minimis safe harbor" (Treas. Reg. 1.263(a)-1(f), the limit
  for a taxpayer without an applicable financial statement since 2016, IRS Notice 2015-82), with a warning
  that it needs the yearly election statement ("Section 1.263(a)-1(f) de minimis safe harbor election", name,
  address and TIN, attached to a timely filed original return). Over $2,500 it is for Form 4562
  (depreciation, section 179 or bonus): line 13 is shown blank with the count and cost, and lines 28 to 31
  leave it out, with a warning that they read high until the preparer adds line 13. An office, supplies or
  other row over $2,500 is flagged as possibly equipment and not moved. The expense list CSV names line
  "13 (Form 4562)". `ScWorksheet.equipment` carries the counts. The regulation text was not fetched in the
  session that built this (irs.gov, ecfr.gov and law.cornell.edu refused through the proxy); the limit and
  the statement's wording were read from tax-software help pages (Drake KB 13513, TaxSlayer) quoting the
  regulation, and match the two free tools in oss-monorepo that already use them
  (`ventures/rental-ledger`, `ventures/self-employed-schedule-c-categorizer`). Check the eCFR text before
  launch. Next, if sellers ask: Form 4562 itself (section 179 limits, MACRS tables), which is preparer work.
  Tests: `test/unit/equipment.test.ts`, `test/worker/equipment.test.ts`.
- Lines 28 and 29.
- Line 30 (2026-11-26), business use of the home by the **simplified method** only, from what the seller
  saves on the Schedule C page (`home_office`, migration 0005: business and whole-home square feet and the
  months with 15 or more days of business use, one row per shop and year; `GET`/`PUT`/`DELETE
  /reports/home-office/:year`, editors to write). `homeOfficeLine30`: $5 × min(area, 300) × months / 12
  (the average monthly allowable square footage), held to line 29 and never below zero, with what the
  limit cut named in a warning since this method carries nothing forward. Sources: Rev. Proc. 2013-13 and
  IRS Publication 587, "Simplified Amount"; the rate and cap were checked against irs.gov on 2026-09-29 for
  oss-monorepo's `ventures/home-office-deduction-calculator`; irs.gov answers 403 through this
  environment's proxy, so the 15-day month rule is from Publication 587's text as known, not re-read here.
  The page says the space must usually be used regularly and exclusively, with the inventory-storage
  exception (IRC 280A(c)(2)), and leaves qualification and the regular method (Form 8829) to the preparer.
- Line 31: 29 − 30.

Every response and the CSV carry the disclaimer. Line 6 (other income) is not computed. The quarterly
estimates below read line 31, so a saved home office lowers them (2026-11-26, estimates-home-office).

**A 1099-K checked against the books** (`src/shared/reconcile-1099k.ts`, 2026-11-26; on the "1099-K notes"
page): the seller types one platform's box 1a (and, if they like, boxes 5a-5l and box 3) and the books'
year for that platform is summed three ways, item sales, plus shipping buyers paid, plus the sales tax
the platform collected, each against box 1a. The IRS defines box 1a before refunds, fees and shipping
adjustments ("without regard to any adjustments for credits", from search excerpts of
irs.gov/instructions/i1099k, which the build environment cannot open). Whether a marketplace's box 1a
includes the sales tax it collected is not stated on any page checked, so the closest of the three is
shown as the closest, never as what the platform includes. A match is within $1 or 0.5% of box 1a.
Findings: which way the gap runs and its usual causes, the year's refunds (which cannot explain a form
lower than the books), boxes 5a-5l that do not add to box 1a, a month with a form amount and no orders
("import that month"), two adjacent months off by the same amount in opposite directions (a month-end
dating difference), and box 3 against the books' order lines. The form's figures come in a POST body
and nothing is stored. Not tax advice; the response carries the disclaimer.

**Quarterly estimated tax** (`src/shared/estimated-tax.ts`, 2026-11-26; the "Quarterly estimates" page):
what to have paid toward federal estimated tax (Form 1040-ES) by each due date, from the books.
- **Profit to date:** `buildScheduleC` takes `through` (a day inside the year) and gives line 31 from
  January 1 to that day, closing inventory on it. A home office saved for the year counts only the months
  used by `through` (`homeOfficeThrough`: a month counts once its 15th day has passed, as the simplified
  method counts a month with 15 or more days of use), held to that period's own line 29; the line 29 limit
  warning stays on the Schedule C page. Each row carries `homeOfficeToDate`, the line 30 taken off.
  Tests: `test/worker/estimates-home-office.test.ts`, `test/unit/books.test.ts`. `profitToDateByPeriod` (service.ts) loads the year's
  rows once and reads it at the Form 2210 Schedule AI period ends (March 31, May 31, August 31,
  December 31), or at `asOf` for the period still running; later periods are null.
- **Tax:** self-employment tax (92.35%, 12.4% to the wage base left after wages, 2.9%), half of it off
  AGI, the standard deduction, a QBI deduction (20%, phased out above the threshold as for a business
  with no payroll; the $400 minimum for 2026), the brackets and the 0.9% Additional Medicare Tax. Only
  years with tables on file (2025, 2026) are taxed; other years use last year's tax alone.
- **Regular:** 25% of the required annual payment, the smaller of 90% of this year's tax (a year in
  progress is projected by days elapsed) and 100% / 110% of last year's (IRC 6654(d)(1)).
- **Annualized (Schedule AI):** lines 21 to 27 and Part II (lines 28 to 36), each period's profit times
  4, 2.4, 1.5 and 1; applicable percentages 22.5%, 45%, 67.5% and 90%.
- **Still to pay** per date: the lower method's cumulative target less estimates paid by then and a
  quarter of the year's withholding per date. Under $1,000 of projected tax after withholding, none.
- Every figure is ported from the MIT ai-bookkeeper engines in oss-monorepo, with the source each was
  checked against in the module's header. Filing status, wages, withholding, last year's tax and payments
  come in the POST body, which stores nothing. Not modelled: credits, itemized and Schedule 1-A
  deductions, other businesses, state tax, the penalty.
- **Saved figures** (2026-11-27, estimates-saved-payments; `estimate_settings`, migration 0009,
  `services/books/estimate-settings.ts`): the page saves those figures and the payments sent toward each
  date per shop and tax year, so every device shows the same ones. Owner and admins only (the
  routes answer 403 to an editor or viewer): wages and last year's tax are the taxpayer's, not the shop's
  books, so for an editor or viewer the page keeps them in localStorage as before. The page saves 0.7 s
  after the last keystroke and shows "Saving… / Saved"; figures a browser held from before move to the
  shop the first time an owner or admin opens that year, and leave the browser once saved. The row is in
  the shop export and goes with the shop (ON DELETE CASCADE). Tests: `test/worker/estimate-settings.test.ts`,
  `src/client/lib/estimate-figures.test.ts`.

**Stock report** (`services/books/stock.ts`, 2026-11-26; the "Stock report" page): what a reseller asks
of their inventory that the P&L does not answer. All of it is the seller's own rows; nothing is estimated.
- **Aging:** items in stock on `asOf` (bought on or before it, not yet gone on it) in five buckets by days
  held (0–30, 31–90, 91–180, 181–365, over a year), with their cost, plus the 25 held longest.
- **Sell-through** for `from`..`to`: items that left as *sold* ÷ (items in stock the day before `from` +
  items bought in the period). Write-offs and personal use are never counted as sold.
- **Days to sell** (median and mean) by platform: sale date − bought date, the platform taken from the
  item's earliest linked order. Items marked sold with no linked order show as "No linked order".
- **Lot payback:** the proceeds of every sale linked to a lot's items up to `asOf`, less the lot's cost,
  and the cost still sitting in its unsold items. Proceeds = item price + shipping charged − refunds − the
  report's own fees on that row − postage on that row; sales tax is left out. They are before expenses not
  tied to a sale (ads bought separately, subscriptions, supplies, and Etsy's fees, which arrive with the
  payment statement as account charges), and the page says so.
- Items marked gone with no date, and sales dated before their purchase, are left out with a warning that
  says how many and where to fix them.

## Tenancy & security

- Every tenant route lives under `/api/orgs/:orgId/*` behind `requireOrg()`, which checks membership and answers
  404 to a non-member. Writes add `requireRole("editor")`. Members and invitations need admin. Deleting the org
  needs the owner and typing the org name.
- **Every query on a tenant table filters by `c.var.tenant.orgId`.** A lookup by id matches both id and org.
  `test/worker/books.test.ts` → "tenant isolation" calls every router with another org's ids.
- Invitations are one-time links. Only the token's SHA-256 is stored, and only a signed-in user whose email
  matches can accept. Wherever sign-in requires a verified address (production and HTTPS), that match means
  the user proved control of the mailbox, so nobody can sign up as the invitee to take the seat.
- Account email (2026-11-26, [EMAIL.md](EMAIL.md)): email verification, password reset and the "you already
  have an account" notice, through Cloudflare Email Service; durable per-IP and per-account auth rate
  limits in D1 (`middleware/auth-rate-limit.ts`). Both ported from apps/payapps.
- Session IPs are not stored. Logs carry ids and counts only, never report contents.
- State-changing requests pass the Origin check. Cookies are HttpOnly, SameSite=Lax, and Secure over HTTPS.
- Import bodies are capped at 5 MB. CSV output neutralises spreadsheet formulas.

## Endpoint contract

Lists: `{ items, nextCursor? }` (offset cursor). Errors: `{ error: { code, message, details? } }`. Money is
integer cents. Calendar dates are `YYYY-MM-DD`.

Public / account
- `GET /api/health`
- `ALL /api/auth/*`: Better Auth (`/sign-up/email`, `/sign-in/email`, `/sign-out`, `/get-session`,
  `/verify-email`, `/send-verification-email`, `/request-password-reset`, `/reset-password`)
- `GET /api/me` → `{ user, memberships: [{ orgId, orgName, role }] }`
- `POST /api/orgs` `{ name }` → 201 `{ orgId }`; `GET /api/orgs` → `{ items: [{ id, name, role }] }`
- `POST /api/invitations/accept` `{ token }` → `{ orgId }`
- `GET /api/reference/reports` → `{ items: [{ key, platform, platformLabel, label }] }`
- `GET /api/reference/fee-sources` → `{ items: PlatformFeeSource[] }`
- `GET /api/reference/1099k` → `{ federal, states, omitted }`

Org (`/api/orgs/:orgId`)
- `GET /` → `{ org: { id, name }, role }`
- `PATCH /` `{ name }` (admin)
- `DELETE /` `{ confirmName }` (owner)
- `GET /members`
- `POST /members/invitations` `{ email, role }` → 201 `{ id, url }`
- `GET /members/invitations`
- `DELETE /members/invitations/:id`
- `PATCH /members/:memberId` `{ role }`
- `DELETE /members/:memberId`
- `POST /imports` `{ report, fileName, csv }` → 201 `{ id, salesCreated, chargesCreated, duplicatesSkipped,
  rowsSkipped, itemsLinked, skipped: [{ line, reason }], warnings }`
  - `report` is one of the keys from `/api/reference/reports`.
  - A file that doesn't match → 400, whose `details` name each missing column and the header names accepted for it.
- `GET /imports`
- `DELETE /imports/:id` → `{ ok, itemsReturnedToStock }`
- `GET /sales?platform=&from=&to=&unlinked=true` → sales with `fees[]`
- `GET /sales/charges?platform=&from=&to=`
- `GET /sales/:id`
- `POST /sales/:id/link-item` `{ itemId }`
- `DELETE /sales/:id/link-item`
- `GET /inventory/lots`, `POST /inventory/lots` `{ name, acquiredDate, vendor?, totalCostCents, notes?,
  items?: [{ title, sku?, costCents? }] }`, `GET|PATCH|DELETE /inventory/lots/:id`
- `GET /inventory/items?status=&sku=`, `POST /inventory/items` `{ title, sku?, acquiredDate?, costCents?, lotId? }`
- `POST /inventory/items/import` `{ fileName, csv, dryRun? }` → 201 (200 with `dryRun`) `{ dryRun, rowCount,
  itemsCreated, duplicatesSkipped, rowsSkipped, salesLinked, totalCostCents, skipped, warnings, matched }`:
  the seller's sourcing sheet saved as CSV (see "Cost of goods")
- `PATCH /inventory/items/:id` `{ title?, sku?, acquiredDate?, costCents? (null = lot share),
  status?: in_stock|written_off|personal_use, disposedDate? }`
- `DELETE /inventory/items/:id`
- `GET /mileage?from=&to=` → `{ items, totalMiles, trips }`
- `POST /mileage` `{ date, purpose, startPlace?, endPlace?, miles, roundTrip? }`
- `DELETE /mileage/:id`
- `GET /expenses?from=&to=`
- `POST /expenses` `{ date, category, amountCents, vendor?, memo?, platform? }`
- `DELETE /expenses/:id`
- `GET /reports/pnl?from=&to=` → `{ cells, byPlatform, byMonth, total }`
- `GET /reports/schedule-c?year=&mileageRate=` → `{ year, disclaimer, lines, partIII, otherExpenses,
  warnings, businessMiles, mileageRateCents }`
- `GET /reports/schedule-c.csv?year=&mileageRate=` (download)
- `POST /reports/estimated-tax` `{ year, asOf?, mileageRate?, filing, wages, otherIncome, withholding,
  priorYearTax?, priorAgiOver150k, paid[≤4] }` (dollars; a body, not a query, so request logs never hold
  the seller's wages or tax) → `{ rows[4] (due, status, profitToDate,
  regularInstallment, annualizedInstallment, cumulativeTarget, credited, stillToPay), projected,
  safeHarbor, exempt, next, warnings }`
- `GET|PUT|DELETE /reports/estimated-tax/settings/:year` (owner, admin) `{ filing, wages, otherIncome,
  withholding, priorYearTax|null, priorAgiOver150k, mileageRate|null, paid[4] }` (dollars; cents in D1)
  → `{ year, settings: {..., updatedAt} | null }`
- `POST /reports/1099k-reconcile` `{ year, platform, box1a, months?[12] (null for a blank box), box3? }`
  (dollars; a body, nothing stored) → `{ bases[3] (key, label, booksCents, differenceCents = form − books),
  closest, matches, toleranceCents, refundsCents, booksOrders, box3Transactions, months (null, or 12 rows of
  booksOrders, booksCents on the closest basis, formCents, differenceCents), findings, disclaimer }`
- `GET /reports/sales-ledger.csv?from=&to=` (download): one row per sale, refund and account charge dated in the range,
  with revenue, fees (and their itemised detail), postage, cost of goods, gross profit, marketplace-collected sales
  tax and the report's own net. Built by the pure `services/books/ledger.ts` with `buildPnl`'s per-row arithmetic,
  so the gross-profit total equals the P&L's for the same dates (a unit test and the worker test pin this);
  subscriptions sit in their own column because the P&L counts them as expenses. Hand-entered expenses and
  mileage are not in it. Linked from the P&L page (its date range) and the Schedule C page (the tax year).
- `GET /reports/quickbooks-journal.csv?from=&to=&cogs=&account.<key>=` (download, 2026-11-26): the ledger's rows
  as QuickBooks Online journal entries, one summary journal per platform per month (`SB-<PLATFORM>-YYYY-MM`,
  dated the month's last day or `to`). Built by the pure `services/books/journal.ts` from `buildSalesLedger`:
  credits for item sales and shipping charged, debits for refunds, ads (line 8), other fees net of credits
  (line 10), postage and subscriptions, and the balance on a `{platform} Clearing` account, so every journal
  balances and the clearing accounts hold what the platforms kept. `cogs=1` adds cost of goods against an
  inventory asset (off by default: sellers who expense purchases from the bank feed would count them twice).
  Marketplace-collected sales tax, hand-entered expenses and mileage are not posted. Columns are the ones
  Intuit's "Import journal entries in QuickBooks Online" article lists (read 2026-11-26); the first row is
  the header QuickBooks maps from, so there are no title or note rows. Dates are MM/DD/YYYY (a US company;
  the article does not state a format). Account names default to `src/shared/journal-accounts.ts`;
  `account.<key>` overrides one (1 to 100 characters, no control characters); the P&L page keeps the
  seller's names in the browser only. Not yet checked against a real QuickBooks import.
- `GET /reports/stock?asOf=&from=&to=` (`to` ≤ `asOf`) → `{ inStock, aging, oldest, sellThrough, speed,
  speedTotal, lots, warnings }`

## Testing

Commands, run from `apps/seller-books`:

```
pnpm typecheck
pnpm test:unit
pnpm test:worker
pnpm build
pnpm exec biome check --write <files>
```

- **Unit:**
  - every importer against its fixture, including reconciliation (item + shipping − fees − postage = net)
  - money, date, CSV and header parsing
  - lot allocation, including the "always adds up" property
  - P&L cell math and roll-ups
  - Schedule C lines and Part III
  - reference-data guards: every 1099-K note has a .gov source, quote and date; no fee rate exists without a quote and date; importers contain no percentage math
- **Worker:**
  - sign-up → org → import → re-import duplicates → delete import
  - a wrong file is explained
  - viewers can't import
  - lot + SKU auto-link → P&L and Schedule C numbers
  - CSV download
  - invitations
  - org deletion cascades
  - the cross-tenant test

## Legal documents

Terms of Service, Privacy Policy, Refund Policy and Acceptable Use Policy (2026-11-26, same pattern as
apps/jobshop-quote, apps/payapps and apps/cmmc):

- Source: `docs/legal/*.md`. `node docs/legal/sync-documents.mjs` bundles them into
  `src/worker/services/legal/documents.ts` (Workers cannot read the repo); a unit test fails if the two
  drift, and checks the wording this app relies on (worksheet not a return, fees only from reports, no AI
  provider, the import file is not kept, no email sent).
- Served publicly at `GET /api/legal` and `/api/legal/:key`, and in the SPA at `/legal/:key` (footer links on
  the sign-in pages and in the org shell; the sign-up form links them).
- `shared/legal.ts` `POLICY_VERSION`: bump it when a document changes in substance. `GET /api/me` returns
  `legal: { version, acceptedAt }`; until the user accepts the current version (`POST /api/me/legal/accept`
  with the version shown), the shop list and the org shell show "Before you continue" instead, and the API
  refuses the shop routes and shop creation with 403 `terms_not_accepted` (`middleware/legal.ts`; see
  "Gaps / next" for what stays open).
  Acceptances are kept per user and version in `legal_acceptance` (migration 0002).
- **Keep the Privacy Policy true when the code changes:** adding an AI model, an email provider, file
  storage for the uploaded reports, or any other subprocessor means updating `privacy.md` and bumping the
  version in the same PR.

## Gaps / next

- **Verification.** Importer column names and every fee/threshold source were researched on 2026-11-24 from
  an environment that could not open marketplace or .gov pages. `docs/IMPORTERS.md` and
  `docs/RESEARCH-2026-11-24.md` say exactly what is confirmed. Before launch:
  - Download one real export per platform and replace or extend the fixtures.
  - 2026-11-26: Mercari's column list and meanings now come from its own help article (541), and the importer
    books only completed orders, dated by completion (IMPORTERS.md, "Mercari"). Etsy's two download paths
    were re-checked on Etsy's help pages. Whatnot's weekly orders report was re-mapped to the full column list
    in its own help article, read through the help centre's public article API (IMPORTERS.md, "Whatnot").
    eBay's help pages answer automated readers with a bot check, so its columns are still from excerpts;
    Depop's article lists contents but no headers, and Poshmark's pages were not reached.
  - 2026-11-26: Amazon's Date Range Report (transaction) importer added with no live page reachable at all
    (IMPORTERS.md, "Amazon"); its columns are the least verified of any importer and need a real export first.
  - Re-read each official page and record any rate in `fee-sources.ts`, with quote and date.
- Account email is built (2026-11-26, [EMAIL.md](EMAIL.md)) and sends nothing until the deploy sets
  `EMAIL_FROM` on an onboarded sender domain; `GET /api/health` then answers `"email": true`. Invitations are
  emailed to the invited address since 2026-11-26 (EMAIL.md, "Invitations"); the link is still shown for
  sharing by hand.
- Expenses from a bank or card statement CSV (2026-11-26, IMPORTERS.md, "A bank or card statement"). A merchant's category is
  learned from the seller's own earlier expenses since 2026-11-26 (IMPORTERS.md, "The seller's own
  choices"). A merchant the seller leaves out is remembered on request since 2026-11-26 (IMPORTERS.md,
  "Merchants the seller leaves out"). Next, if sellers ask: a receipt photo per expense. The statement layouts still need a real export each before launch.
- Onboarding: a getting-started checklist on the Profit & loss page since 2026-11-26
  (`src/shared/getting-started.ts`, `GET /api/orgs/:orgId/getting-started`): import a report, add stock
  costs, link sales to items, log expenses or mileage. Each step is a row count in the shop's own books, so
  it ticks itself for every member and device and nothing about it is stored; editors and above see it,
  it goes once all four are done, and "Hide" is a per-browser convenience. Next, once real shops are
  counted: which step most of them stall on (an admin-metrics count per step) and change that step.
- Year-end records (2026-11-26, `services/books/year-end.ts`): `GET /reports/closing-inventory.csv?year=`,
  `/reports/mileage-log.csv?year=&mileageRate=` and `/reports/expenses.csv?year=`, linked from the Schedule C
  page. The inventory list and line 41 share one rule (`onHandAt` in `schedule-c.ts`), so its total is line
  41; the mileage log totals to the worksheet's business miles. Tests: `test/unit/year-end.test.ts`,
  `test/worker/year-end.test.ts`. The year-end package since 2026-11-27:
  `GET /reports/year-end.zip?year=&mileageRate=` ("Everything for your preparer" on the Schedule C page) holds the
  worksheet, the year's sales ledger, the three lists and the QuickBooks journal (default account names, no COGS),
  each byte for byte its single download, plus a `README.txt` naming every file, the figure it totals to and the
  worksheet's warnings. A stored ZIP from `src/worker/lib/zip.ts` (no dependency; CRC-32 checked against zlib and
  the archive against `unzip -t` in `test/unit/zip.test.ts`). Next, if sellers ask: a PDF of the worksheet.
- Line 35 from last year's return (2026-11-26, `filed_inventory`, migration 0007): the seller types in the
  line 41 they filed for the year before (`PUT /reports/filed-inventory/:year`, the Part III card on the
  Schedule C page). That figure is line 35, the books' own December 31 count stays in the line's note
  (`openingInventory` in the worksheet JSON), and a warning gives the gap and which way it moves line 42.
  The books are never rewritten to match: the seller fixes their items or asks their preparer. Tests:
  `test/unit/opening-inventory.test.ts`, `test/worker/filed-inventory.test.ts`,
  `test/e2e/12-filed-opening-inventory.spec.ts`. Next, if sellers ask: read the figure from last year's
  return PDF.
- Mileage from a tracker app's CSV export since 2026-11-26 (IMPORTERS.md, "A mileage tracker's trip
  export"): business trips only, a purpose required per trip, re-import safe. Tests:
  `test/unit/mileage.test.ts`, `test/worker/mileage-import.test.ts`, `test/e2e/11-mileage-import.spec.ts`.
  Next: a real export per app as a fixture (the headers are unconfirmed); a Google Maps Timeline export if
  sellers ask.
- Direct sales since 2026-11-26 (`POST /api/orgs/:orgId/sales`, `DELETE .../sales/:id`, the Sales page's "Add a
  direct sale"): a sale or refund made off the marketplaces, typed in, stored as a `sale` row with platform
  `direct` and no import batch, so the P&L, Schedule C line 1/2, the ledger CSV and the journal export count it
  like an imported order. A payment app's fee is a `payment_processing` fee; a stock item picked on the form is
  marked sold on the sale date (deleting the sale puts it back). The free plan's 25 orders a month apply; the
  platform limit does not (billing counts platforms by import, `platformsUsed`). No sales tax field: the form
  asks for the price before tax. Expenses can be tagged "Direct sales" (booth fees, market rent) so they sit in
  that P&L row. Tests: `test/worker/direct-sales.test.ts`. Square's card reader sales import
  since 2026-11-26 (platform `square`, `services/importers/square.ts`, IMPORTERS.md "Square"), and PayPal's Activity download since 2026-11-27 (platform `paypal`,
  `services/importers/paypal.ts`, IMPORTERS.md "PayPal"); next, if sellers ask: PayPal Zettle's, Venmo's statement.
- Still open from the 2026-11-26 quality audit (`oss-monorepo` `portfolio/quality/audits/2026-11-26-seller-books.json`):
  nothing. Fixed since 2026-11-26 (mileage-rate-by-trip-date): line 9 prices each trip at the IRS rate on its date
  (above, "Line 9"), and the mileage log's rows carry that rate and amount, totalling to line 9 to the cent
  (`test/unit/mileage-rates.test.ts`, `test/worker/year-end.test.ts`). Fixed since 2026-11-26: a returned item goes back in stock when the
  seller says it came back. A refund row only says money went back, so "Item came back?" on a refund (Sales
  page; `GET/POST /api/orgs/:orgId/sales/:refundId/returned-items`, `DELETE .../returned-items/:itemId`)
  adds a copy of the sold item to stock (`inventory_item.return_sale_id` and `returned_from_item_id`,
  migration 0008): dated the day it came back (the refund's date by default), at the original's cost,
  outside any lot. The original stays sold on its sale date, so a year already filed keeps its line 41, and
  the copy is never a purchase (line 36 leaves it out, with a note): its cost was in cost of goods sold when
  it sold, and on hand again it comes back out through line 41 (a negative line 42 when it comes back the
  next year and nothing else sold is correct). The candidates are the items the refund's own order sold when
  the report gives an order number, else the latest items sold on or before the refund. An item comes back
  once; the copy goes when the refund is deleted (with its import or by hand) or when the original goes back
  in stock (its sale unlinked), and an order that sold the copy again is then left unlinked, so the
  unlinked-sales check names it. Since 2026-11-26 (returns-restock) the P&L, the sales ledger and the
  QuickBooks journal book the same reversal: the order keeps its cost in its month, and the refund that
  brought the copy back carries minus that cost in its own month (`loadReturnedItems` in
  `services/books/service.ts`; a refund with no copy reverses nothing and is never "missing cost"), so the
  profit page and line 42 agree. Tests: `test/worker/returned-items.test.ts`,
  `test/worker/return-cogs.test.ts`, `test/unit/return-cogs.test.ts`, `test/e2e/13-refund-restock.spec.ts`. Next, if sellers ask: a partial refund that kept the item, flagged
  as such, and a returned item written off as damaged in one step. The stock report counts the copy as an
  item of its own (in stock from the return, days to sell from then). Fixed: multi-unit orders and items bought after the sale (above), and since
  2026-11-26 Part III names the sales with no item linked (or fewer items than units sold) whenever stock
  bought on or before the last of them is still counted in line 41: the warning and line 41's note give that
  stock's cost as the most line 41 can be overstated by, `unlinkedSales` carries the counts, and the Schedule C
  page links to the Sales page. The figure itself is never moved, since a sale of something never entered as
  an item needs no change. Tests: `test/unit/unlinked-sales.test.ts`, `test/worker/unlinked-sales.test.ts`.
- USD only; rows in other currencies are skipped with a reason.
- Serving URL is undecided. A path prefix works since 2026-11-26 (`BASE_PATH=/seller-books/app pnpm build`,
  [DEPLOY.md](DEPLOY.md), "Path prefix"), so the app can share `marisstella.app` with
  `apps/seller-books-site` at `/seller-books`; the deploy workflow still builds for a host root.
- Billing is built and dark (2026-11-26, [BILLING.md](BILLING.md)): plans, limits on platforms, users and
  the Free plan's orders, Paddle checkout, portal and webhook through `packages/billing`. Still missing
  for a paid launch: the owner's settings (BILLING.md, "Turning it on"). The deploy workflow with the
  Paddle catalog sync is built (2026-11-26, [DEPLOY.md](DEPLOY.md)) and runs by hand. CI is
  `.github/workflows/seller-books-ci.yml`.
- The Playwright e2e suite (2026-11-26, README "Tests") covers sign-up to the worksheet, the Free plan's
  platform limit and upgrade, tenant isolation, phone width, invitations, the account-email pages
  (reset and confirmation), the inventory sourcing-sheet import, the card-statement import and the 1099-K
  check against the books.
- Terms acceptance is enforced by the API since 2026-11-26 (`middleware/legal.ts`): every
  `/api/orgs/:orgId/*` route (after the membership check, so a non-member still gets 404) and creating a shop
  answer 403 `terms_not_accepted`, with the version to accept in `details.version`, until the user has
  accepted the current `POLICY_VERSION`; an acceptance of an earlier version does not count. Open on purpose:
  `/api/me` (status and acceptance), the legal documents, sign-in, the shop list, accepting an invitation
  (the invitee is asked for the terms on first opening the shop, `test/e2e/05-invitations.spec.ts`), the
  Paddle webhook and the admin API. The browser refetches `/api/me` on that 403 (`client/lib/query.ts`), so a
  tab left open across a policy change shows the "Before you continue" card. Tests:
  `test/worker/legal.test.ts`, "the terms are enforced by the API".
- Line 30 is the simplified method only (2026-11-26). Next, if sellers ask: Form 8829 (actual expenses,
  depreciation and carryovers) and a business area that changes mid-year. Line 30 in the quarterly
  estimates by the months used to each period end is done (2026-11-26).
- Quarterly estimates (2026-11-26) save the seller's own figures and the payments sent per year in D1
  since 2026-11-27 (above, "Saved figures"). Next: a reminder email a week before each due date to the
  owner and admins who ask for it (the saved row now holds what was paid, so a date already covered sends
  nothing), and, if sellers ask, state estimated payments.
- Depop refunds have no separate date in the download, so they are booked on the sale date (with a warning).
