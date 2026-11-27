# Job Shop Quote launch review (2026-11-27)

The record `ventures/jobshop-quote/docs/legal/OPERATOR.md` ("Who approves launch") asks for before an
agent runs the first production deploy (`.github/workflows/priv-jobshop-quote-deploy.yml`) and opens
sign-ups. It follows Seller Books' review (`ventures/seller-books/apps/seller-books/docs/LAUNCH-REVIEW.md`).
Checkout stays dark: `JOBSHOP_BILLING_PROVIDER` is not set, so the free "Early access" plan is the only
one a stranger can use until the Paddle account is verified (docs/BILLING.md). Turning on live checkout
needs its own check of the Paddle side and is not covered here.

## 1. Profitable at scale

Costs of serving: Cloudflare Workers, D1 and R2, Workers AI (text from uploaded PDFs and images),
Cloudflare Email Service, and the Anthropic API for "Extract with AI" and cover notes
(`LLM_MODEL` `claude-haiku-5-5` in `wrangler.jsonc`). No other outbound host in `src/worker`
besides Paddle and Intuit (QuickBooks, only when a shop connects it).

`src/shared/plans.test.ts` holds every paid plan above the 40 % floor with the shop spending its
**whole monthly AI ceiling** (`llmMonthlyCapUsd`, enforced per shop by `services/guards/llm-budget.ts`),
plus the owner's support time ($15 / $25 a shop-month), hosting per RFQ and per shop
(`CLOUDFLARE_HOSTING` in `packages/billing`), Paddle's 5 % + $0.50 and a 3 % refund reserve. It passes
on this commit. The same formula worked by hand:

| Plan | Price | AI ceiling | Cost a month (model) | Margin |
| --- | --- | --- | --- | --- |
| Shop, monthly | $199.00 | $60 | $92.97 | 53 % |
| Shop, annual | $2,149 ($179.08/mo) | $60 | $90.92 | 49 % |
| Shop Plus, monthly | $399.00 | $150 | $210.72 | 47 % |
| Shop Plus, annual | $4,309 ($359.08/mo) | $150 | $207.07 | 42 % |

These are worst cases: the plan comment puts a full Shop allowance at about $50 of AI on Opus prices,
and the app runs on Haiku. Condition met for the paid plans.

**The free plan is the exposure, and it is the only plan on sale at launch.** Each free shop may spend
up to its own ceiling ($20 a month on `free`, and `ORG_MONTHLY_LLM_CAP_USD` 25 as the env backstop);
across all shops `GLOBAL_DAILY_LLM_CAP_USD` is $200 a day, so the theoretical ceiling is about $6,000
a month of AI with no revenue. What bounds it at launch:

- **AI is off on the first deploy.** The ported workflow reads only `JOBSHOP_ANTHROPIC_API_KEY` (no
  fallback to the shared `ANTHROPIC_API_KEY`, unlike the private original). Until the owner sets it,
  "Extract with AI" answers 503, cover notes use the template, and the rest of the app (rate card,
  manual parts, costing, PDFs, email, customer links) works at Cloudflare cost only.
- **Before setting the key**, the owner should pick a global daily cap that matches what free sign-ups
  are worth to them (for example `GLOBAL_DAILY_LLM_CAP_USD` 10 to 25 in `wrangler.jsonc`, or `0` as the
  kill switch). This is the owner's money, so this review records it as their decision, not a change.
- Workers AI is metered on the Cloudflare account. The catalogue runs on the free plan
  (`CLAUDE.md`, "Hosting"), where Workers AI stops at its daily allowance rather than billing. If the
  account moves to Workers Paid, recheck this line.

## 2. Legal pages read against the product

All four pages read in full (terms, privacy, refunds, acceptable use), then checked against the
code: every table in `src/worker/db/schema` (37 tables), every outbound host in `src/worker`, and
every `email.send` call (auth, quote email and sender copy, customer-link answers, expiry and
follow-up reminders, RFQ arrival notices, allowance notices, the operator's new-paid email).

| Check | Finding | Action |
| --- | --- | --- |
| Operator and contact | Maris Stella Labs LLC, Colorado; hello@marisstella.app on every page | none |
| No claim of review, certification or endorsement | No "counsel", no "Draft"; no engineering, legal, tax or accounting advice (Terms §3) | none |
| Terms §2, what the Service does | Listed reading RFQs, pricing, PDFs, cover notes, quote email and the won/lost log. The app also receives RFQs by email (`services/inbound`), shares a sent quote by a customer link the customer can accept or decline through (`services/quotes/customer-link.ts`), prints a job traveler (`/quotes/:id/traveler.pdf`), sends expiry and follow-up reminders, and sends won quotes to QuickBooks Online (`packages/qbo-sync`) | **fixed**: §2 lists them |
| Terms §3, customer answers | A customer's acceptance through a link is recorded and forwarded; nothing said who it binds | **added**: whether it forms an order is between the shop and its customer |
| Terms §10, before closing | Named only the quote PDFs; the won/lost report downloads as CSV (`/analytics.csv`) | **fixed** |
| Privacy, rate card | Cut speeds, removal rates and drill feeds (`cut_speeds`, `removal_rates`, `drill_feeds`) and the material price history with who changed it, the supplier and the sheet date (`material_price_changes`) were not listed | **fixed** |
| Privacy, emails sent | RFQ arrival notices (opt-in per member, `services/inbound/notify.ts`) and the 80 %/100 % allowance emails to owners and admins (`services/allowance-notice.ts`) were not listed under "Why we use it" | **fixed** |
| Privacy, operator email | `services/owner-notify.ts` emails the platform administrators the shop's name, plan, price and the owner's name and email on a new paid subscription (off unless `OWNER_NOTIFICATIONS=on`) | **fixed**: disclosed under Security |
| Privacy, rest of the data | Account, sessions, invitations (hash only), RFQs and files, refused inbound senders (last 10), quotes, emails, links (hash only), responses, QuickBooks tokens (encrypted) and invoices, AI usage (no RFQ text), billing, acceptances, admin audit log, rate-limit counters: each matches the code | none |
| Privacy, subprocessors | Cloudflare (hosting, D1, R2, Email Routing and Service, Workers AI), Anthropic, Paddle; Intuit only as the shop's own connected provider. No other outbound host | none |
| Refunds | Free plan with no card; 30-day full refund through Paddle; cancel any time, keep the paid period, quotes stay readable. Matches docs/BILLING.md | none |
| Renewal terms | Monthly or annual, cancel from the billing page; Paddle's checkout shows its own terms. Buyers are businesses (machine and fabrication shops), so Colorado's consumer automatic-renewal rules matter less than for Seller Books; still listed in OPERATOR.md's open checks | none |
| Acceptable use | Own shop only, checked quotes, no CUI/ITAR/EAR data, no spam through the quote email or the RFQ address, no probing; matches the tenant, sender-allowlist and rate-limit code | none |

The terms' and privacy policy's version lines moved to 2026-11-27 and `POLICY_VERSION` to
`2026-11-27.1`, so anyone who accepted the earlier text is asked again. `node
docs/legal/sync-documents.mjs` regenerated the bundled copy; the unit test checks the two match.

## 3. Cyber and legal risk review

`python3 platform/security/risk_review.py` from the public repository, answered in the pull request.
The change is policy text, one version constant and this record: no new endpoint, secret, dependency
or data flow.

## 4. What the first deploy does and does not turn on

- Sign-ups open on `https://jobshop-quote.marisstella.app` (the workflow's default `JOBSHOP_DOMAIN`
  since 2026-11-27, as PayApps and Seller Books), or on workers.dev if the token cannot reach the zone.
- **R2 is not required** (corrected 2026-11-27; this line said the run stops without it). Without the
  bucket, files go to D1's `file_blobs` and `/api/health` answers `"files": "d1"` (docs/DEPLOY.md).
- Production requires email verification. If `/api/health` answers `"email": false`, nobody can finish
  signing up; the next step is docs/EMAIL.md, not a second deploy. The sender
  `no-reply@marisstella.app` already delivers for PayApps.
- AI extraction is off until `JOBSHOP_ANTHROPIC_API_KEY` is set (section 1).
- Paid plans stay dark; every shop is on Early access (40 RFQs a month, 3 users).
- RFQs by email stay off unless `JOBSHOP_INBOUND_EMAIL=on` (docs/EMAIL.md).
