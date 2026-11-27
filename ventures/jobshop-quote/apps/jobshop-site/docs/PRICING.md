# Pricing proposal and cost model

**Status: proposal.** The product (sibling app `apps/jobshop-quote`) is in development, nothing is for
sale, and early access is free. The pricing page shows these plans as "Proposed · Not on sale yet".
The numbers live in `src/shared/plans.ts`; `test/unit/plans.test.ts` fails the build if a paid plan,
billed monthly or annually, leaves the markup band.

## The approach: cost-plus, anchored on the market

Same method as apps/grants' `docs/PRICING.md`: each plan's price is a multiple of what it costs us to
serve a shop that uses its whole allowance (Claude tokens + hosting + merchant-of-record fees + a refund
reserve), and the allowance is derived from the price so every plan keeps its margin. One difference
from grants:

- **Margin: at least 40%; 40–60% is a minimum goal, higher is better** (owner, 2026-11-24: "the 40-60 isn't a limit for how high the margins go but a sort of minimal goal"; owner, 2026-11-24: "we want to aim for min 40-60% margins
  in the products"; the same policy as grants and `packages/billing`). Allowances are derived at a 50%
  margin (2×); the test fails below 40% (1.67×) and has no ceiling. This replaced the 2026-11-19 band of
  [1.5×, 2.5×] with a 1.6× target, and cut the allowances from 200 / 400 to 125 / 300 RFQs.
- **Support time is in the cost.** Setting up a shop's rate table and fixing misread drawings takes the
  owner's time, so each plan carries an estimated support cost per shop-month.

The **$199/month anchor** is the market's entry price for this job: QuotedPart lists $199/mo per shop.
Broader tools cost more: JobBOSS² about $3,000/yr, ProShop $650–715/mo (sources below). We price the
entry plan at that anchor and let cost-plus set what it includes.

## Plans

| Plan | Price/mo | Annual (10% off) | RFQs/mo | Seats | Support est./mo | Full cost/mo (monthly / annual) | Markup (margin) monthly / annual |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Early access (free, development only) | $0 | — | 40 | 3 | absorbed | ≈ $16.70 (absorbed) | — |
| Shop | $199 | $2,149 | 125 | 3 | $15 | $83.02 / $80.97 | 2.40× (58%) / 2.21× (55%) |
| Shop Plus | $399 | $4,309 | 300 | 10 | $25 | $180.84 / $177.19 | 2.21× (55%) / 2.03× (51%) |

How the allowance is set: `deriveRfqAllowance` takes the largest multiple of 25 RFQs that keeps the
markup ≥ 2× (a 50% margin) for **both** monthly and annual billing. Annual billing is the binding constraint (10% off,
fixed fee once a year). "Full cost" assumes the whole allowance is used; most shops will use less.

**What counts as an RFQ:** one customer request with any number of parts, up to 10 drawing pages;
bigger packages count once per 10 pages. Re-reading, editing and re-pricing the same RFQ doesn't count
again. The cost model assumes an average of 3 drawing pages per RFQ; if real RFQs run larger, the
page cap protects the margin.

**Early access** is capped at 40 RFQs/month so its cost stays bounded (about $17 per shop-month at
the cap). Early-access shops are told final prices before anything is charged and are never moved onto
a paid plan without choosing it (the pricing page says so).

## Cost model (`src/shared/plans.ts`)

Prices: Claude Opus 5.5 at $4/M input and $20/M output (the figures apps/grants' cost model uses).
Token counts are **design estimates for a product that isn't built**, not measurements.

| Stage (purpose) | Calls/RFQ | In | Out | Cost/RFQ |
| --- | --- | --- | --- | --- |
| `rfq.intake`: email + attachment list → parts, quantities, due date | 1 | 5,000 | 1,200 | $0.044 |
| `drawing.read`: one drawing page (image + instructions) → features, tolerances, finish | 3 | 4,500 | 1,800 | $0.162 |
| `quote.check`: independent check of every extracted value; flags what it can't confirm | 1 | 9,000 | 1,800 | $0.072 |
| `quote.letter`: cover note around the priced lines (prices come from code) | 1 | 3,000 | 900 | $0.030 |

Sum $0.308 × 1.3 revision factor (re-reads, edits, re-checks) = **≈ $0.40 per RFQ**. No prompt
caching assumed; caching the shop's rate table and rules would lower it.

Other costs:

- **Hosting:** $0.30 per shop-month (Workers Paid $5/mo spread over 25 shops, plus D1/R2) + $0.01 per
  RFQ for storing and serving drawings.
- **Merchant of record:** 5% + $0.50 per charge (Paddle, as for grants); spread over 12 months on
  annual plans.
- **Refund reserve:** 3% of revenue.
- **Support:** $15 (Shop) / $25 (Shop Plus) per shop-month, an estimate of onboarding and fix-up time.

## Before taking money

1. Measure real token use on real early-access RFQs (the product should meter every LLM call by
   `purpose`, as grants does) and update `STAGE_TOKENS`; the tests re-derive the allowances.
2. Measure support hours per shop for the first cohort and update `supportPerMonth`.
3. Re-check competitor prices on the vendors' own pages (below are third-party listings).
4. Decide whether early-access shops get a founding discount. The site promises nothing beyond
   "told before anything is charged".

## Competitor prices (from `portfolio/monetization/bets.md`, bet #2, researched 2026-11-24)

Aggregator figures; they can disagree with vendors. Re-check before quoting them anywhere public.

| Product | Price | Source |
| --- | --- | --- |
| QuotedPart | $199/mo per shop | [Toolradar](https://toolradar.com/tools/quotedpart) |
| JobBOSS² | about $3,000/yr | [SoftwareConnect](https://softwareconnect.com/manufacturing-estimating-quoting) |
| ProShop | $650–715/mo | [G2](https://www.g2.com/products/proshop/pricing) |
| Paperless Parts | quote only; raised a $30M Series B | [BusinessWire](https://www.businesswire.com/news/home/20210913005163/en/Paperless-Parts-Announces-30M-Series-B-Funding-Led-by-OpenView-Partners) |

Funded entrants (why to ship narrow and soon): Forgepoint ($9.8M seed), CloudNC ($20M, Quote Agent),
Uptool ($6M seed); links in bets.md. The public site names no competitors.
