# Seller Books: Architecture (v0.1)

Seller Books keeps the books for people who resell on eBay, Poshmark, Mercari, Whatnot, Depop and Etsy.
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
  services/books/      lots.ts, pnl.ts, schedule-c.ts (pure), service.ts (tenant-scoped DB loads)
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
- An order is linked to the item it sold. On import this happens automatically when the order's SKU (custom
  label) matches an in-stock item. Otherwise it is linked by hand on the Sales page.
- **P&L COGS:** the cost of the linked item, booked in the month of the sale. Orders with no linked item are
  counted and flagged, because their profit is overstated.
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
- Line 9: standard mileage, using the cents-per-mile rate the seller enters. The app does not assume a rate.
- Line 10: other marketplace fees.
- Line 24b: 50% of meals.
- Line 27a: postage and subscriptions, listed in Part V.
- Lines 28 and 29.

Every response and the CSV carry the disclaimer. Line 6 (other income) and line 30 (home office) are not
computed.

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
  with the version shown), the shop list and the org shell show "Before you continue" instead.
  Acceptances are kept per user and version in `legal_acceptance` (migration 0002).
- **Keep the Privacy Policy true when the code changes:** adding an AI model, an email provider, file
  storage for the uploaded reports, or any other subprocessor means updating `privacy.md` and bumping the
  version in the same PR.

## Gaps / next

- **Verification.** Importer column names and every fee/threshold source were researched on 2026-11-24 from
  an environment that could not open marketplace or .gov pages. `docs/IMPORTERS.md` and
  `docs/RESEARCH-2026-11-24.md` say exactly what is confirmed. Before launch:
  - Download one real export per platform and replace or extend the fixtures.
  - Re-read each official page and record any rate in `fee-sources.ts`, with quote and date.
- Account email is built (2026-11-26, [EMAIL.md](EMAIL.md)) and sends nothing until the deploy sets
  `EMAIL_FROM` on an onboarded sender domain; `GET /api/health` then answers `"email": true`. Invitations are
  still links the admin shares (emailing them, as apps/payapps does, is next if shops ask).
- USD only; rows in other currencies are skipped with a reason.
- Serving URL is undecided: the app runs at a host root; `apps/seller-books-site` plans
  `marisstella.app/seller-books`, so a production app path needs the `BASE_PATH` handling apps/grants has.
- Billing is built and dark (2026-11-26, [BILLING.md](BILLING.md)): plans, limits on platforms, users and
  the Free plan's orders, Paddle checkout, portal and webhook through `packages/billing`. Still missing
  for a paid launch: the owner's settings (BILLING.md, "Turning it on"). The deploy workflow with the
  Paddle catalog sync is built (2026-11-26, [DEPLOY.md](DEPLOY.md)) and runs by hand. CI is
  `.github/workflows/seller-books-ci.yml`.
- No e2e suite yet. A Playwright smoke test of sign-up → lot → four imports → P&L → worksheet was run by hand.
- Depop refunds have no separate date in the download, so they are booked on the sale date (with a warning).
