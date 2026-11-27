# Seller Books launch review (2026-11-27)

The record `docs/legal/OPERATOR.md` ("Who approves launch") asks for before an agent runs the first
production deploy and opens sign-ups. It follows PayApps' review (`apps/payapps/docs/LAUNCH-REVIEW.md`).
Checkout stays dark: `SELLER_BOOKS_BILLING_PROVIDER` is not set, so the Free plan is the only one a
stranger can use until the Paddle account is verified (docs/BILLING.md, "Turning it on"). Turning on
live checkout needs its own check of the Paddle side and is not covered here.

## 1. Profitable at scale

Seller Books makes no LLM calls and sends no data to an AI provider: no outbound host in `src/worker`
(grep for `fetch(` and `https://`: only the marketplaces' fee pages and state 1099-K pages cited as
sources in `src/shared/reference/`, which the code never fetches), and `wrangler.jsonc` binds only D1
and `send_email`, with no AI, R2, KV or queue. Cost of serving is Cloudflare Workers and D1.

`src/shared/plans.test.ts` holds every paid plan above the 40 % floor at **twice** its order allowance,
with the owner's support time ($5 / $10 / $20 an org-month, deliberately pessimistic), Paddle's 5 % +
$0.50 and a 3 % refund reserve. It passes on this commit. The figures it computes:

| Plan | Price | Cost a month (model) | Margin |
| --- | --- | --- | --- |
| Side hustle, monthly | $15.00 | $7.00 | 53 % |
| Side hustle, annual | $150 ($12.50/mo) | $6.34 | 49 % |
| Full time, monthly | $35.00 | $13.61 | 61 % |
| Full time, annual | $350 ($29.17/mo) | $12.69 | 56 % |
| Business, monthly | $69.00 | $26.37 | 62 % |
| Business, annual | $690 ($57.50/mo) | $24.99 | 57 % |

Most of the cost is the support-time allowance and Paddle's fixed fee, not hosting. Condition met.

## 2. Legal pages read against the product

All four pages read in full (terms, privacy, refunds, acceptable use), then checked against the code:
every table in `src/worker/db/schema` (`auth.ts`, `billing.ts`, `books.ts`), every route in
`src/worker/routes`, the importers in `services/importers`, and every `email.send` call.

| Check | Finding | Action |
| --- | --- | --- |
| Operator and contact | Maris Stella Labs LLC, Colorado; hello@marisstella.app on every page | none |
| No claim of review, certification or endorsement | No "counsel", no "Draft"; non-affiliation with the marketplaces and the IRS stated | none |
| Terms §2, what the Service does | Described imports, cost of goods, mileage, expenses, P&L and Schedule C. The app also reads bank/card statements, computes line 30 (home office, simplified method), records closing inventory, sizes quarterly estimated tax (Form 1040-ES, regular and annualized), compares the books with a typed Form 1099-K, and exports a QuickBooks Online journal and a year-end ZIP | **fixed**: §2 lists them |
| Terms §2, names used | Square (importer) and Intuit/QuickBooks (journal export) missing from the non-affiliation sentence | **fixed** |
| Terms §3, who is responsible | Covered fees, cost of goods, the worksheet and 1099-K notes, not the estimated-tax figures (which leave out credits, itemized deductions, state tax and the penalty: `shared/estimated-tax.ts` header), the home-office qualification and de minimis safe-harbor election (`services/books/schedule-c.ts`), or exports | **fixed**: three bullets added |
| Terms §10, before closing | Named only the Schedule C worksheets; the year-end ZIP (`/reports/year-end.zip`) and the full JSON export (`/export`) exist | **fixed** |
| Privacy, year-end figures | `home_office` (office and home square feet, months used) and `filed_inventory` (closing inventory per year) were not listed | **fixed**: listed |
| Privacy, expenses | `expense.platform` was not listed | **fixed** |
| Privacy, spreadsheets imported | Inventory and mileage spreadsheets are parsed in the request and only rows inserted (`importers/inventory-store.ts`, `routes/org/mileage.ts`; no file storage bound) | **added**: "is not kept" |
| Privacy, rate limits | `middleware/auth-rate-limit.ts` keeps counters in `verification` keyed by IP and, for failed sign-ins, a hash of the address | **added** |
| Privacy, 1099-K figures | `POST /reports/1099k-reconcile` computes and returns; nothing is inserted | **added**: "not stored" |
| Privacy, operator email | `services/owner-notify.ts` emails the operator the shop's name, plan, price and the owner's name and email on a new paid subscription (off unless `OWNER_NOTIFICATIONS=on`) | **fixed**: disclosed under Security |
| Privacy, rest of the data | Account, sessions, invitations (hash only), imports (file not kept; buyer usernames only inside a hash), statement lines and remembered merchants, inventory, lots, mileage, estimate settings (owner/admin only), billing, acceptances, admin audit log: each matches the code | none |
| Privacy, subprocessors | Cloudflare (hosting, D1, Email Service) and Paddle. No other outbound host | none |
| Privacy, email sent | Verification, reset, "already have an account", invitations; no marketing mail from the app. Matches the user-facing `email.send` call sites (`services/auth/emails.ts`, `routes/org/members.ts`) | none |
| Refunds | Free plan with no card; 30-day full refund through Paddle; cancel any time, keep the paid period, records stay readable. Matches docs/BILLING.md ("Nothing is ever hidden or deleted") | none |
| Renewal terms | Monthly or annual, cancel from the billing page; Paddle's checkout shows its own terms. Resellers can be consumers as well as businesses, so Colorado's automatic-renewal rules (OPERATOR.md, open checks) matter more here than for PayApps: check them before live checkout | **noted** for the checkout review |
| Acceptable use | Own accounts only, honest records, others' data, no probing; matches the tenant and invitation code | none |

The terms' version line moved to 2026-11-27 and `POLICY_VERSION` to `2026-11-27.2`, so anyone who
accepted the earlier text is asked again. `node docs/legal/sync-documents.mjs` regenerated the bundled
copy; the unit test checks the two match.

## 3. Cyber and legal risk review

`python3 platform/security/risk_review.py` from the public repository, answered in the pull request.
The change is documentation and policy text plus one version constant: no new endpoint, secret,
dependency or data flow.

## 4. What the first deploy does and does not turn on

- Sign-ups open on `https://seller-books.<account subdomain>.workers.dev` (or `SELLER_BOOKS_DOMAIN`).
- Production requires email verification. If `/api/health` answers `"email": false`, nobody can finish
  signing up; the next step is docs/EMAIL.md, not a second deploy.
- Paid plans stay dark (above); every shop is on Free (one platform, one user, 25 orders a month).
- The deploy workflow is not yet ported to the public repository (its `ventures/seller-books/DEPLOY.md`,
  "Not yet"); this review is what that first run needs on the legal side.
