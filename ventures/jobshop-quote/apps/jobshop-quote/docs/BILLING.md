# Job Shop Quote billing

Paid plans ship **dark**. Until the owner sets the Paddle secrets below, `createBillingProvider`
returns `null`: checkout answers 503, the Billing page says paid plans are not on sale yet, and every
shop is on the free early-access plan. Nothing in this repository holds a key.

Built on [`packages/billing`](../../../packages/billing/README.md), imported as source through the
`@billing` path alias (`aliases.ts`, `tsconfig.json`), so `package.json` and the lockfile are
unchanged. The webhook, checkout-token and entitlement code is ported from `apps/payapps`
(`docs/BILLING.md` there) and follows the same rules; the limits are this app's own.

## Plans (`src/shared/plans.ts`)

| Plan         | Monthly | Annual  | RFQs a month (AI reads) | Users     | AI ceiling a month | Sold |
| ------------ | ------- | ------- | ----------------------- | --------- | ------------------ | ---- |
| Early access | $0      | –       | 40                      | 3         | $20                | no (default) |
| Shop         | $199    | $2,149  | 125                     | 3         | $60                | yes  |
| Shop Plus    | $399    | $4,309  | 300                     | 10        | $150               | yes  |
| Complimentary| $0      | –       | unlimited (fair use)    | unlimited | $150               | no (operator grant) |

These are the numbers the marketing site's pricing page proposes (`apps/jobshop-site/src/shared/plans.ts`,
reasoned in its `docs/PRICING.md`): $199 matches QuotedPart's listed price per shop, and the RFQ
allowances are derived there at a 50% margin. `src/shared/plans.test.ts` fails CI when the app and the
site disagree, so a price change is made in the site's file first and copied here. They are untested
hypotheses until the first paying shop.

**The margin test is a worst case.** `plans.test.ts` charges each paid plan its whole **AI ceiling**
(not the cost model's ~$0.40 an RFQ), plus support time, hosting, Paddle's 5% + $0.50 and a 3% refund
reserve, and fails below a 40% margin for monthly and annual billing. The app runs on
`claude-haiku-5-5` (`LLM_MODEL`), so a typical shop's AI cost is a small fraction of the ceiling; the
ceiling is what keeps a shop with unusually large drawing packages from selling a plan at a loss.

## What the limits do

- **The AI reading a new RFQ** (`POST /api/orgs/:orgId/rfqs/:rfqId/extract`) past the month's
  allowance: 402 `payment_required`, with the reset date. An RFQ counts **once per 10 drawing
  pages, at least once**, the first time the AI reads it, the pricing page's rule ("bigger packages
  count once per 10 pages"); re-reading, editing and re-pricing it are free. Each claim is a row in
  `rfq_counts` (units, pages, month); one SQL statement inserts it only while the shop has room for
  all of it and no other claim on that RFQ landed meanwhile, so two reads at once cannot both take
  the last one or count the same pages twice. A read that fails (model error, budget guard) deletes
  its claim. A package bigger than what is left gets a 402 that says how many it needs and how many
  are left; a smaller RFQ can still be read.
- **What a page is** (`src/shared/pdf-pages.ts`): a PDF counts the pages in its page tree, read from
  the raw file and its compressed object streams at upload (`rfq_files.page_count`; checked against
  poppler's `pdfinfo` on Chromium, LibreOffice and pdfunite files); an image is one page; the pasted
  email, text files and CAD models count nothing on their own. A PDF whose page count cannot be read
  without guessing (encrypted object streams, a broken file) counts as one page, so a reading error
  never makes an RFQ cost more. The RFQ page shows each PDF's pages and what the next read will count
  before anyone presses the button.
- **Drawings added after a read** count only past each 10 pages: a 7-page RFQ that gains 3 pages
  is still one RFQ; one that grows to 22 pages counts 2 more on its next read, in that month. RFQs
  counted before this rule (migration 0005) carry one unit each with their pages unrecorded. Pasting an RFQ,
  uploading drawings and CAD, entering parts by hand, pricing and sending quotes are never blocked.
- **Inviting a user** when members plus open invitations fill the plan's seats: 402.
- **Accepting an invitation** when the shop has no free seat (the plan changed since it was sent): 402.
  A user who is already a member takes no seat.
- **AI spend:** the plan's ceiling replaces the global `ORG_MONTHLY_LLM_CAP_USD` default for every
  shop (`planLlmCapMicros`, wired through the budget guard's `orgCapMicros` hook in `context.ts`).
  The global daily kill switch (`GLOBAL_DAILY_LLM_CAP_USD`) still applies on top.
- Nothing is ever hidden or deleted. A lapsed shop keeps every RFQ, quote and PDF.

Allowances are per **calendar month, UTC**, the same month the AI ceiling uses (not the subscription's
anniversary), so the Billing page can say exactly when they reset.

A subscription grants its plan while `active`, `trialing` or `comp`, and while `past_due` for 7 days
from the first failed renewal (the Billing page shows the deadline). After that, or when
`canceled`/`paused`, early-access limits apply.

## Allowance emails (`services/allowance-notice.ts`, 2026-11-25)

When an AI read that counts brings the month's RFQs to 80% of the plan's allowance (rounded up:
32 of 40, 100 of 125, 240 of 300), the shop's owners and admins get one email; when it reaches
100%, one more. A read that jumps past 100% sends only the 100% email.

- **Once a month per threshold.** An `allowance_notices` row (primary key shop + `YYYY-MM` +
  threshold, migration 0012) is inserted before anything is sent; only the read whose insert lands
  sends, so concurrent reads cannot double it. The row keeps the count, the allowance and how many
  sends succeeded or failed. Re-reading a counted RFQ counts nothing and sends nothing.
- **Who:** owners and admins only (they can change the plan), at most 10, one message each;
  confirmed addresses only where sign-in requires them. Estimators and viewers are not mailed.
- **What it says:** the counts, the plan, the reset date (UTC), that every RFQ, quote and PDF stays
  and parts can still be entered and quoted by hand. The next plan's name, allowance and monthly
  price come from `PLAN_LIST` and appear **only when checkout is on** (`ctx.billing` set); while
  paid plans are dark it says they are not on sale yet and links nowhere. The shop name is
  defanged like the RFQ arrival email's, so it cannot carry a link.
- **Never blocks the read:** a send or database error is logged (ids only) and the read's result is
  returned as usual. The complimentary plan (no allowance) never gets one.

Tests: `test/worker/allowance-notice.test.ts`.

**The RFQ page banner (2026-11-25).** Every member, estimators and viewers included, sees the same
80% and 100% lines at the top of the RFQ page, from the billing summary any member can already
read (`GET /billing`), so nobody is surprised when the AI stops reading new RFQs. The thresholds
live in `src/shared/allowance.ts` and the emails import them, so the banner and the email cross
at the same count. Owners and admins get a link to the billing page; other members are told an
owner or admin can change the plan. No prices, and while checkout is dark nobody is told to
upgrade. A failed billing read shows no banner rather than an error. Tests:
`src/shared/allowance.test.ts`.

**The note on the New RFQ form (2026-11-26).** At 100% the form itself says, next to the submit
button, that a new RFQ will be saved but not read by the AI, that its parts can be entered by hand
on the next page, and when the allowance resets; the button reads "Create RFQ (enter parts by
hand)" instead of "Create and extract". The note's action line is the banner's, word for word
(`intakeNote` calls `allowanceBanner`), so it never offers an upgrade while checkout is dark. The
form is not blocked and the read is still attempted: a stale billing summary must not stop a read
that has room, and a read without room answers 402 and counts nothing. Below 100% the form is
unchanged. Creating an RFQ refreshes the billing summary, so the banner and the note move with the
read that used the last slot.

**The package note on the New RFQ form (2026-11-26).** When drawings are picked, the form counts
their pages in the browser by the worker's own rule (`src/shared/upload-pages.ts`: the same media
type fallback, `isCadFile` and `filePages`, so a PDF whose page tree cannot be read counts as one
page and CAD and text count none), and `packageNote` in `src/shared/allowance.ts` says what the
first read will use:

- a package of more than 10 pages that fits gets a grey line: "These drawings come to 27 pages, so
  the AI reading this RFQ uses 3 of this month's AI-read RFQs (one per 10 drawing pages); 13 are
  left on the Shop plan";
- one that needs more than is left gets the red note: it will be saved but not read, enter parts
  by hand or attach only the drawings the quote needs, the reset date, and the banner's action line
  word for word (no upgrade while checkout is dark). The button reads "Create RFQ (enter parts by
  hand)". This shows below 80% too, where the banner is silent: a 105-page set on a 40-RFQ plan
  with 10 left;
- nothing for a one-RFQ package, a plan with no allowance, or at 100% (`intakeNote` speaks then).

The form is never blocked: the worker counts the stored files again and that count is the one
charged. Tests: `src/shared/upload-pages.test.ts` (real Chromium and LibreOffice PDFs, 12 + 15 pages
is 3), `src/shared/allowance.test.ts`, and the browser path in `test/e2e/07-package-size-note.spec.ts`.

## Routes

| Route | Who | What |
| --- | --- | --- |
| `GET /api/billing/plans` | anyone | Public plan list (for a pricing page) |
| `POST /api/billing/webhook` | Paddle | Signature-verified; always 200 once verified |
| `GET /api/orgs/:orgId/billing` | members | Plan, status, this month's RFQs, seats, plans |
| `POST /api/orgs/:orgId/billing/checkout` | admins | `{plan, interval, promoCode?}` → hosted checkout URL |
| `POST /api/orgs/:orgId/billing/portal` | admins | Paddle customer portal URL |

The webhook is mounted before the Origin check and the session middleware: Paddle sends no cookie and
no Origin, and its signature is the authentication. Webhook security follows `packages/billing`
exactly: the shop is bound only by an existing subscription id or a signed, unexpired, single-use
checkout token (never `custom_data.orgId`); the plan comes only from the billed price; `comp` is never
granted by a webhook; another customer cannot take over a shop's subscription; events are idempotent
on `(provider, event id)` and an event that threw is retried on redelivery.
`test/worker/billing.test.ts` covers each of these, plus the cross-tenant case.

The page is `/app/:orgId/billing` (`src/client/routes/billing.tsx`). Checkout is Paddle's hosted page;
the app never sees a card number.

## Turning it on (owner steps)

1. Paddle account verified (needs live pricing, terms, privacy and refund pages: the marketing site
   `apps/jobshop-site` has the pricing page; the legal pages are still to come with the deploy,
   ROADMAP item 3).
2. The catalog: `billing/paddle-catalog.json` is generated from `PLAN_LIST` (a unit test fails when it
   is stale) and synced by `node packages/billing/scripts/paddle-catalog.ts --catalog
   apps/jobshop-quote/billing/paddle-catalog.json --apply --price-ids-out price-ids.json`; the deploy
   workflow (ROADMAP item 3, not built yet) will run it as payapps' does and pass the ids to the Worker
   as `BILLING_PRICE_IDS`.
3. Worker secrets (owner only, app-prefixed in GitHub, e.g. `JOBSHOP_BILLING_API_KEY`):
   `BILLING_API_KEY`, `BILLING_WEBHOOK_SECRET`, plus the variable `BILLING_PROVIDER=paddle` (a var,
   not a secret; `wrangler.jsonc` ships `none`). `AUTH_SECRET` also signs checkout tokens.
4. A Paddle notification destination at `https://<jobshop host>/api/billing/webhook` for
   `subscription.*` and `transaction.completed`, with its own secret (not payapps').

## Operators

Grant a pilot shop unlimited use with a `comp` row:

```sql
INSERT INTO subscriptions (org_id, plan_key, status, cancel_at_period_end, created_at, updated_at)
VALUES ('org_…', 'comp', 'comp', 0, unixepoch() * 1000, unixepoch() * 1000);
```

## Local demo

`.dev.vars.example` sets `FAKE_EXTERNALS=true`, which selects the signed fake provider: checkout
returns to `/app/:orgId/billing?checkout=success&fake_checkout=…` without charging. The fake is
refused when `APP_ENV=production`.

## Not done yet

- Measure real token use per RFQ from `llm_calls` on early-access shops before taking money
  (`apps/jobshop-site/docs/PRICING.md`, "Before taking money").
