# ADR 0007: Merchant-of-record billing with cost-plus pricing

- **Status:** Accepted; pricing band amended 2026-11-24 (see "Amendment" below)
- **Date:** 2026-11-19
- **Details:** [PRICING.md](../PRICING.md)

## Amendment (2026-11-24): a 40% margin floor

The owner, 2026-11-24, setting $10k monthly recurring revenue (and then profit) as the goal for every
product: "we want to aim for min 40-60% margins in the products", and on the resulting prices, "i think
that's reasonable for the value prop". So the cost-plus band below is replaced:

- every paid plan keeps **at least a 40% margin** (price ≥ 1.67× full cost at full allowance), monthly
  and annual; `plans.test.ts` fails the build below it, and there is no ceiling;
- quotas are derived at a **50% margin** (`TARGET_MARKUP = 2`), leaving headroom for drift;
- prices move from $5 / $20 / $100 to **$10 / $29 / $149** so the tiers keep about the drafts they had
  (1 / 5 / 31, was 1 / 5 / 33). PRICING.md has the table.

Later the same day the owner set the model rule ("use the cheapest model that does the job correctly
... no need to use opus for a haiku task"), and grants moved to `claude-haiku-5-5`. A draft fell from
about $1.30 to about $0.03, so plans now include a chosen 5 / 20 / 120 drafts at the same prices, capped
by the cost model at a 50% margin (82–88% at full use).

The rest of this record (the billing unit, Paddle, no free tier, measuring real cost) stands. Where the
text below says 1.3×–2.0× or the old prices, this amendment wins.

## Context

Customers are charities, many of them small. The owner's goal is not to profit from them, only never to
lose money serving a paid plan. Most of our cost is variable: Claude tokens make up most of the
roughly $1.30 for each drafted, verified application. Selling subscriptions in many US states and
countries creates sales tax and VAT obligations that a one-person company should not handle itself.

## Decision

- **Cost-plus pricing.** For each plan, the price divided by the full cost of an org that uses the whole
  plan must be between **1.3× and 2.0×**. Full cost is tokens, Cloudflare hosting, merchant fees and a 3%
  refund reserve, from `src/shared/billing/cost-model.ts`. `plans.test.ts` fails the build if a monthly
  or annual price falls outside that band. Draft quotas come from `deriveIncludedDrafts`
  (`TARGET_MARKUP = 1.35`), so prices stay fixed ($5 / $20 / $100) and quotas adjust when costs change.
- **The billing unit is applications drafted per month** (`usage_events`, kind `application_draft`).
  An application counts once per period. Regenerating, editing and re-verifying never use more quota.
  Matching, extraction and interviews are covered by fair-use allowances in the cost model.
- **A merchant of record: Paddle.** Paddle is the legal seller. It collects and remits sales tax and VAT
  and handles invoices, refunds and chargebacks. Paddle sits behind the `BillingProvider` port
  (`ports/billing-provider.ts`, factory in `ports/billing-providers.ts`). The provider is chosen with
  `BILLING_PROVIDER`, and webhooks are HMAC-verified and applied idempotently (`billing_events`).
- **No permanent free tier.** Pilot partners get `comp` subscriptions (`grantComp`, audited). Promo
  codes and a 30-day money-back guarantee replace free trials.
- **Measure real cost.** Every LLM call writes `llm_calls.cost_micros`. `applicationCost()` reports cost
  for each application, and spend guards (`services/guards/llm-budget.ts`: a monthly cap per org and a
  global daily cap) limit how much one runaway org or bug can spend.

## Consequences

- The owner never registers for or files sales tax. That costs Paddle's 5% + $0.50 per charge, which is
  steep on a $5 plan. Annual billing and asking Paddle for small-value pricing reduce it.
- When model prices or prompts change, cost and price can drift apart. The margin test catches this in CI,
  and `evals/cost-benchmark.ts` re-measures real token use.
- This is a real constraint on architecture: anything that adds a cost per org (SSR servers, extra
  vendors, more model calls) has to fit inside the band. ADR 0001 and ADR 0002 depend on this.
- The offline demo (`FAKE_EXTERNALS=true`) treats an org without a subscription as comp, and checkout
  activates immediately, so the full flow can be shown without Paddle.

## Alternatives considered

- **Stripe Billing + Stripe Tax** (not a merchant of record). Cheapest per charge, but the owner would
  have to register and file sales tax in each state. Kept as a fallback behind the same port.
- **Polar, Lemon Squeezy, Stripe Managed Payments** (merchants of record). Fees are similar or higher,
  and each has open questions about non-US card surcharges, product direction or preview pricing
  (PRICING.md compares them).
- **Value-based pricing** (a share of awarded grants, or high flat tiers). Doesn't fit the mission, and a
  success fee creates incentive and grant-compliance problems.
- **Free with donations.** Can't sustain cost that grows with every draft.
