# Pricing, cost model and billing

Grant Autopilot prices each plan so it keeps **at least a 40% margin** over what it costs us to serve an
org that uses the whole plan (Claude tokens + Cloudflare hosting + merchant-of-record fees + a refund
reserve), with 40–60% as a minimum goal and higher better, never a cap (owner, 2026-11-24: "the 40-60 isn't a limit for how high the margins go but a sort of minimal goal"; and owner, 2026-11-24: "we want to aim for min 40-60% margins in the
products"; this replaces the 2026-11-19 cost-plus band of 1.3×–2.0×, see ADR 0007). A unit test
(`src/shared/billing/plans.test.ts`) fails the build if any paid plan, billed monthly or annually, falls
below the 40% floor (price < 1.67× full cost). This catches drift when model prices or prompts change.
There is no ceiling.

## What we charge for

The billing unit is **applications drafted per month**. Drafting is the high-value step and the costly
one: it covers requirements parsing, cited section drafts, an executive summary and independent grounding
verification. Each plan also includes fair-use allowances for opportunity fit-scoring, document fact
extraction and interview turns, which the cost model accounts for.

- An application counts **once per quota period**. Regenerating sections, editing them and re-verifying
  never use up more quota (`recordUsage` adds the cost to the existing usage row).
- Quotas reset monthly on the subscription's anniversary (annual plans reset monthly too). Comp orgs reset
  on the UTC calendar month.

## Plans

| Plan                          | Price/mo | Annual (10% off) | Drafts/mo | Opportunity scores/mo | Seats | Est. full cost/mo | Markup (margin) monthly / annual |
| ----------------------------- | -------- | ---------------- | --------- | --------------------- | ----- | ----------------- | ----------------------- |
| Pilot partner (comp)          | $0       | —                | 25        | 500                   | 50    | $1.85 (absorbed)  | —                       |
| Starter                       | $10      | $108             | 5         | 20                    | 3     | $1.84             | 5.44× (82%) / 6.92× (86%) |
| Standard                      | $29      | $313             | 20        | 100                   | 10    | $4.08             | 7.11× (86%) / 7.70× (87%) |
| Pro                           | $149     | $1,609           | 120       | 400                   | 25    | $18.28            | 8.15× (88%) / 8.07× (88%) |

How the numbers are set: each plan offers a chosen number of drafts (`includedDrafts`: 5 / 20 / 120,
cheaper per draft as the tier rises), capped by the cost model at the largest quota that keeps a 50%
margin (markup ≥ 2×, `TARGET_MARKUP`, `deriveIncludedDrafts` in `src/shared/billing/plans.ts`) for
**both** monthly and annual billing. The test fails below a 40% margin. "Est. full cost" assumes the org
uses its entire allowance; typical orgs use less, so the realised margin is higher, by an amount that is
unmeasured until there are paying orgs (`usage_events` records it).

History (2026-11-24): prices moved from $5 / $20 / $100 to $10 / $29 / $149 when the 40% floor
replaced the cost-plus band, with Opus 5.5 drafting at about $1.30 an application (1 / 5 / 31 drafts).
The same day the default model moved to Haiku 5.5 (see "Model" below), which cut a draft to about
$0.03; the prices stayed and the allowances rose to 5 / 20 / 120.

- **The merchant's fixed fee is now the biggest cost on Starter.** At $10, the fee ($0.50 + 5%), hosting
  and the refund reserve take about $1.40 of the $1.84. Annual billing ($108) pays the fixed fee once a
  year instead of 12 times.
- **No permanent free tier.** We use promo codes and the money-back guarantee instead (below). Pilot
  partners such as Southwest Indian Foundation get the **comp** plan through
  `grantComp(ctx, orgId, note)`. This writes `subscriptions.status = "comp"` and an audit entry. Comp
  is never sold and its cost is absorbed (capped by its quotas).
- **Offline demo** (`FAKE_EXTERNALS=true`): an org without a subscription row is treated as comp, and
  checkout activates the chosen plan immediately so the flow can be shown end to end.

## Cost model (`src/shared/billing/cost-model.ts`)

### Model

The owner, 2026-11-24: "use the cheapest model that does the job correctly ... no need to use opus for
a haiku task". Grants runs on **`claude-haiku-5-5`** (`LLM_MODEL` in `wrangler.jsonc`; the cost model's
`DEFAULT_MODEL`). A purpose moves up to Sonnet or Opus only when the evals (`docs/EVALS.md`) show Haiku
getting it wrong; record the purpose, the failing case and the model here when that happens. The
adapter supports per-purpose overrides (`modelByPurpose` in `ports/anthropic-llm.ts`). Haiku has no
server-side refusal fallback, so the adapter leaves that option off for it and a decline surfaces as
`LlmRefusalError`.

**Not yet measured:** the live evals have not been run on Haiku 5.5 (they need the owner's API key:
`LLM_MODEL=claude-haiku-5-5 pnpm tsx evals/...`, see `docs/EVALS.md`). The grounding checks still block
any unsupported claim whatever the model, but draft quality on Haiku is unmeasured until that run.

Token assumptions per call. Output includes adaptive-thinking tokens. The table shows Opus 5.5 prices
for reference ($4/M input, $20/M output, $0.20/M cache read, $5/M cache write); the plans are costed on
Haiku 5.5 (`MODEL_PRICES["claude-haiku-5-5"]`: $0.10/M input, $0.50/M output, $0.01/M cache read,
$0.125/M cache write, for prompts up to 100K tokens), where every row costs about 1/40th as much.

| Stage (purpose)                         | In     | Out   | Cache read | Cache write | Cost/call |
| --------------------------------------- | ------ | ----- | ---------- | ----------- | --------- |
| requirements.parse (10k-token RFP)      | 12,000 | 2,500 | 0          | 0           | $0.098    |
| drafting.section — first (writes cache) | 3,500  | 2,500 | 0          | 17,000      | $0.149    |
| drafting.section — cached fact context  | 3,500  | 2,500 | 17,000     | 0           | $0.067    |
| drafting.summary                        | 9,000  | 1,200 | 0          | 0           | $0.060    |
| grounding.verify (per section)          | 7,500  | 1,800 | 0          | 0           | $0.066    |
| matching.score (per opportunity)        | 1,500  | 450   | 4,000      | 200         | $0.017    |
| knowledge.extract (per document page)   | 900    | 450   | 1,500      | 75          | $0.013    |
| interview.turn                          | 1,800  | 400   | 3,000      | 150         | $0.017    |

**One application** has 6 sections and a ×1.3 revision factor for regenerations and re-verification. On
Haiku 5.5 it costs about **$0.03**; on Opus 5.5 about **$1.30**: parse $0.10, drafts $0.63, summary $0.06, verification $0.51. Output tokens
dominate. Prompt caching makes each extra section's 17k-token fact context cost about $0.003 instead of
about $0.07.

**Hosting per org-month** costs about $0.30 plus $0.01 per draft. The Workers Paid plan ($5/month)
includes generous D1, Queues, Workflows and requests; we spread it over a conservative 25 paying orgs
($0.20 each). On top of that we budget $0.10 per org for R2 storage (about 1 GB at $0.015/GB), Vectorize
stored and queried dimensions, Workers AI embeddings (bge-m3), toMarkdown conversion, Whisper minutes and
email, plus $0.01 per draft for retrieval and the stored submission package.

**Merchant-of-record fee:** 5% + $0.50 per charge (Paddle). For annual billing it is spread over 12
months. **Refund reserve:** 3% of revenue, because refunds still cost us the fee and the tokens already
used.

The comp plan absorbs costs. If we have fewer than 25 paying orgs, the Workers base fee is also absorbed
(at most $5/month in total).

### Re-running the benchmark

```bash
cd apps/grants
pnpm tsx evals/cost-benchmark.ts                          # no key: prints the model estimate + plan table
ANTHROPIC_API_KEY=sk-... pnpm tsx evals/cost-benchmark.ts --sections=6 --markdown
```

When a key is set, the script sends prompts sized like a real application, for a clearly fictional org
("Example Valley Trades Collective"), through the same `AnthropicLlm` adapter the app uses. These
prompts cover requirements parsing, N cached section drafts, a summary, per-section verification,
matching, fact extraction and an interview turn. The script prints the measured tokens and cost per
stage next to the model estimate. A full run costs about $1–2. If the measurements differ by more than
about 20%, update `STAGE_TOKENS` and run `pnpm test:unit`; the derived quotas adjust automatically.

In production, every LLM call is metered in `llm_calls.cost_micros`. You can read the actual cost of
each application with `applicationCost(ctx, orgId, applicationId)` (`GET /applications/:id/cost`). Each
period's billed units and their measured cost are stored in `usage_events`, so margins can be checked
against real data.

## Merchant of record: **Paddle**

**Decision: Paddle Billing.** It is the most established merchant of record (MoR) for small SaaS
subscriptions. As the legal seller, Paddle calculates, collects, files and remits US state sales tax and
international VAT/GST, so the owner never registers for sales tax. It also issues invoices, handles
refunds and chargebacks, and supports discount codes, a customer portal, simple HMAC-signed webhooks and
a sandbox. Its 5% + 50¢ fee is the same as the other MoRs, and Paddle offers bespoke pricing for
products under $10; the Starter plan is now exactly $10, so this matters less than it did at $5.

| Option                  | Fees (Nov 2026)                                                                | Tax handling                  | Notes                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paddle** ✅           | 5% + $0.50 per transaction; custom pricing for <$10 products                    | Full MoR (sales tax/VAT)      | Mature; discounts, refunds API, customer portal sessions, `Paddle-Signature` HMAC webhooks, sandbox. Onboarding requires domain/website review (live pricing page, terms, refund policy, privacy policy). |
| Polar                   | Starter 5% + $0.50 (paid tiers 3.4–3.8% + 30–40¢ at $20–$400/mo); +1.5% non-US cards | MoR                           | Developer-friendly, open source, Standard Webhooks. Close second; the non-US card surcharge and its younger tax operations tipped the decision to Paddle.                                                    |
| Lemon Squeezy           | 5% + $0.50 plus surcharges (international, PayPal, subscriptions)               | MoR                           | Owned by Stripe, which is steering users to Managed Payments. Not a good choice for new billing.                                                                                                          |
| Stripe Managed Payments | About 3.5% on top of Stripe processing (2.9% + 30¢) plus Stripe Billing for subscriptions | MoR (preview pricing) | Most expensive for subscriptions and pricing may still change. We could switch later, since the owner already has Stripe.                                                                                 |
| Stripe + Stripe Tax     | 2.9% + 30¢ + about 0.5%                                                          | **Not** an MoR: the owner files | Cheapest, but the owner would have to register and file sales tax in each state. Kept as a fallback behind the same `BillingProvider` port.                                                        |

The fixed per-transaction fee is what hurts small plans: $0.50 is 5% of a $10 charge (10% of the old $5). We handle that with
annual billing (one fixed fee a year), by asking Paddle for small-value pricing, and by including the fee
in the cost model so the margin test catches it.

Sources (accessed 2026-11-19): [Paddle pricing](https://www.paddle.com/pricing) ·
[Paddle webhook signature verification](https://developer.paddle.com/webhooks/signature-verification) ·
[Polar pricing](https://polar.sh/resources/pricing) ·
[MoR comparison 2026 (alexcloudstar)](https://alexcloudstar.com/blog/merchant-of-record-indie-saas-2026/) ·
[Stripe Managed Payments fees (dodopayments)](https://dodopayments.com/blogs/stripe-managed-payments-fees-explained) ·
[Lemon Squeezy status (checkoutpage)](https://checkoutpage.com/tools/lemon-squeezy-fee-calculator).
Several comparison sources are competitor blogs, so re-check the vendor pricing pages before going live.

### Paddle setup (owner checklist)

1. Create a Paddle account and complete verification. Paddle reviews the domain and needs a live
   pricing page, terms, a privacy policy and a refund policy (`/legal/refunds`).
2. Create one product with a monthly and an annual price for each paid plan. Put the price ids in the
   `BILLING_PRICE_IDS` secret as JSON:
   `{"starter":"pri_…","starter:annual":"pri_…","standard":"pri_…","standard:annual":"pri_…","pro":"pri_…","pro:annual":"pri_…"}`.
3. Set Checkout → **Default payment link** to a Paddle hosted-checkout launch URL. The transactions we
   create return their `checkout.url` from this setting.
4. Under Notifications, add a destination at `https://<app>/api/billing/webhook` for `subscription.*`,
   `transaction.completed` and `adjustment.*`.
5. Set these secrets: `BILLING_PROVIDER=paddle`, `BILLING_API_KEY` (a `pdl_sdbx_…` key selects the
   sandbox API automatically), `BILLING_WEBHOOK_SECRET` and `BILLING_PRICE_IDS`. `AUTH_SECRET` must
   also be set: it signs checkout tokens (see below), and checkout fails without it.
6. Create promo codes under Discounts (for example `NONPROFIT10`).

### Webhooks

`POST /api/billing/webhook` is unauthenticated. Trust comes from the `Paddle-Signature` HMAC (5-minute
timestamp tolerance). Every event is stored once in `billing_events`, unique on provider and event id.
A redelivered event that was already processed returns `duplicate`. An event whose processing failed is
retried. The route always answers 200 with `applied`, `duplicate` or `ignored`, so Paddle does not keep
retrying events we chose to ignore. The reason is stored in `billing_events.error` and logged.

**Which org an event belongs to.** A signed event can still come from a checkout someone crafted (for
example with Paddle.js), so we never read `custom_data.orgId` or `custom_data.planKey`.

- `POST /billing/checkout` (admin+) writes a `pending_checkouts` row: org, plan, interval, creator,
  `expiresAt` 24 hours later (`CHECKOUT_TOKEN_TTL_MS`), and `consumedAt`. The Paddle transaction gets
  only `custom_data.checkoutToken = "<checkoutId>.<hex HMAC-SHA256(AUTH_SECRET, checkoutId|orgId)>"`.
  The token does not contain the org id. To check it, we load the row and recompute the HMAC with that
  row's org.
- The webhook takes the org from exactly one of two places. The first is an existing subscription
  whose `providerSubscriptionId` matches the event. The second is a token that is valid, not expired
  and not yet used. The first subscription that uses a token consumes it (`consumedAt` and
  `providerSubscriptionId`). Any other subscription that later uses the same token is ignored as
  `checkout token replay`. A retried delivery for the same subscription is still accepted. If neither
  place gives an org, the event is ignored and nothing changes.
- If the org already has a subscription with a different `providerCustomerId`, we keep the existing
  subscription. The event is recorded as `customer mismatch` and audited as
  `billing.subscription_conflict`. Checkout reuses the org's existing Paddle customer, so a real
  re-subscription always matches.
- The plan comes only from the billed price id, never from `custom_data`. Webhooks never grant `comp`.

**Ordering.** Paddle does not guarantee delivery order. We store each event's `occurred_at` as
`billing_events.occurred_at`, and the last applied one as `subscriptions.provider_updated_at`. If an
event is older than that, we record it and ignore it (`out-of-order event`, or `stale subscription`
when it is about a different subscription). A late cancel for an old subscription never replaces a
comp grant or a newer subscription.

**past_due grace.** A failed renewal does not block drafting right away. `subscriptions.past_due_since`
is set from the first `past_due` event. Later `past_due` events (Paddle's payment retries) keep that
start date. The field is cleared when the subscription goes back to any other status. For
`PAST_DUE_GRACE_DAYS` (7, in `src/shared/billing/grace.ts`) the org keeps drafting. During that time,
`GET /billing` returns `graceUntil`, and the billing page shows a warning banner. After that,
`assertCanDraft` returns 402. A row that went `past_due` before this tracking existed has no start
date, so it gets no grace period.

## Promo codes and refunds

- **Promo codes** replace free trials. `POST /billing/checkout { planKey, promoCode }` resolves the code
  to an active Paddle discount and attaches it to the transaction. Unknown or expired codes return 400.
  Good uses: a first month at 50–100% off for referrals or conferences, and permanent nonprofit-coalition
  discounts, as long as the discounted price still covers cost.
- **Money-back guarantee:** a full refund on request within 30 days of the first paid subscription payment, no questions asked (see `docs/legal/refunds.md`, the binding policy). Later renewals are refundable for billing errors or extended outages.
  Paddle processes the refund as the seller (adjustments), so we never handle card data. Repeated
  refund-then-resubscribe abuse can be declined. The 3% refund reserve in the cost model pays for this.
- **Cancellation:** at any time from the Paddle customer portal (`POST /billing/portal`). Access continues
  until the end of the paid period (`cancelAtPeriodEnd`).

## Implementation map

| Piece                                                            | File                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| Cost model / plans / period keys / DTOs                          | `src/shared/billing/{cost-model,plans,period,types}.ts`  |
| Margin band + cost model tests                                   | `src/shared/billing/plans.test.ts`, `period.test.ts`     |
| Service (`assertCanDraft`, `recordUsage`, `grantComp`, …)        | `src/worker/services/billing/index.ts`                   |
| Webhook application (idempotent, ordered, audited)               | `src/worker/services/billing/webhooks.ts`                |
| Pending checkouts + signed checkout tokens (org binding)         | `src/worker/services/billing/checkout.ts`, `ports/billing/checkout-token.ts` |
| past_due grace period                                            | `src/shared/billing/grace.ts` (+ `grace.test.ts`)        |
| Paddle adapter (fetch + WebCrypto HMAC)                          | `src/worker/ports/billing/paddle.ts` (+ `paddle.test.ts`) |
| Signed fake provider (tests / offline demo)                      | `src/worker/ports/billing/fake.ts`                       |
| Provider factory                                                 | `src/worker/ports/billing-providers.ts`                  |
| Routes                                                           | `src/worker/routes/org/billing.ts`, `routes/billing-webhook.ts` |
| Integration tests (quota, webhook idempotency/signatures, roles) | `test/worker/billing.test.ts`                            |
| Security tests (org binding, token replay, ordering, grace)      | `test/worker/billing-security.test.ts`                   |
