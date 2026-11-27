# Pricing and cost model (PayApps)

**Status: the app's prices, not yet charged.** The site shows the plans the app (`apps/payapps`) is
set up to sell; checkout there is dark until the owner sets the Paddle secrets
(`apps/payapps/docs/BILLING.md`). The site's copy of the plans is `src/shared/plans.ts`;
`test/unit/plans-sync.test.ts` reads the app's `src/shared/plans.ts` and `packages/billing`'s annual
discount and fails when the site shows a different name, price, job, user or storage limit, or annual
price. **Change a price in the app first, then here.** `src/shared/plans.test.ts` fails the build if a
paid plan leaves the $99–$249 range or the cost-plus band below.

History: the first version of this site (PR #18, 2026-11-24) proposed Solo $99 / Crew $169 / Office
$249 with an AI cost per job. The app landed its own catalog the same day (Free, Solo $99, Crew $179,
Company $249) and makes no AI calls, so on 2026-11-25 the site was brought in line with the app.

## Approach: cost-plus, like apps/grants

Estimate what it costs to serve a customer who uses the **whole** plan, then price inside a fixed
markup band of **1.5×–2.0×**. The app's own test (`apps/payapps/src/shared/plans.test.ts`) is a
different, looser floor: a 40% margin on hosting, storage and fees only, where every plan clears 90%.
This model adds the cost that dominates in practice, **support time**: setting up each job's schedule
of values and answering "why doesn't my total match the GC's?".

## What we charge for

The billing unit is **active jobs**: jobs not yet closed in the app. Closing a finished job frees its
slot, and its records stay readable on every plan. Cost scales with jobs, not contract value; subs know
how many jobs they bill; and a flat price is easier to plan for than a percentage of billings.

## Plans

| Plan    | Price/mo | Annual | Active jobs | Users     | Storage | Support budget | Full-use cost/mo | Markup |
| ------- | -------- | ------ | ----------- | --------- | ------- | -------------- | ---------------- | ------ |
| Free    | $0       | –      | 1           | 1         | 250 MB  | 0 h            | $0.42            | –      |
| Solo    | $99      | $1,069 | 5           | 2         | 5 GB    | 0.75 h         | $54.00           | 1.83×  |
| Crew    | $179     | $1,933 | 20          | 3         | 20 GB   | 1.25 h         | $90.92           | 1.97×  |
| Company | $249     | $2,689 | unlimited   | unlimited | 50 GB   | 1.75 h         | $130.57          | 1.91×  |

Crew and up add lien waivers per pay app and QuickBooks Online (invoices with retainage, payments
applied). Company is modelled at 200 active jobs (the app's `FAIR_USE_ACTIVE_JOBS`).

## Cost model (`COST_ASSUMPTIONS` in `src/shared/plans.ts`)

| Item | Assumption | Solo | Crew | Company |
| --- | --- | --- | --- | --- |
| Merchant of record | 5% + $0.50 per charge (Paddle) | $5.45 | $9.45 | $12.95 |
| Refund reserve | 3% of price | $2.97 | $5.37 | $7.47 |
| Support / onboarding | $60 per loaded hour × budget | $45.00 | $75.00 | $105.00 |
| Hosting | $0.40 base (Workers Paid over 25 customers) + $0.02 per job | $0.50 | $0.80 | $4.40 |
| Storage | R2 at $0.015/GB-month, allowance full | $0.08 | $0.30 | $0.75 |
| **Total** | | **$54.00** | **$90.92** | **$130.57** |

No AI cost: the app makes no model calls today. If SOV import from PDF (on the roadmap) uses a model,
add its per-job cost here and re-run the band test.

**Sensitivities.** Support is over 80% of cost. If onboarding takes twice the budget, every plan falls
to about 1.0× and the band test fails. That is the point: change `supportHours` when early access gives
real numbers, and the test shows whether prices have to move. Crew sits near the top of the band
(1.97×); a price rise there needs a support budget rise to stay inside it.

## Reaching $10k MRR

At an assumed mix of 40% Solo, 40% Crew and 20% Company (blended $161/month), $10,000 MRR needs
**63 paying customers** (`customersForMrr`). At 100% Crew it is 56. Planning numbers, not forecasts.

## Market check (not shown on the site)

From the owner's ranked bets (oss-monorepo `portfolio/monetization/bets.md`, bet #1, researched
2026-11-24). These come from aggregators that disagree with each other and with vendors, so **check
each on the vendor's own page and record the date before putting any comparison on the site**:

| Product | Price as listed | Source (as cited in bets.md) |
| --- | --- | --- |
| PayAppHub | $39.99 / $79.99 / $129.99 a month | Toolradar |
| Trimble Pay (Flashtract), sub plan | $99 a month | G2 |
| SubLien | from $199 a month | SaaSworthy |
| Siteline | quote only, priced by pay-app volume | Siteline |
| JobTread (suite) | $199 a month + $20 a user | JobTread blog |
| Knowify (suite) | from $99 a month | Capterra |

Solo at $99 sits with Trimble Pay's sub plan and under SubLien; Crew at $179 is under JobTread's base.
PayAppHub is cheaper, so the case for the price is breadth (cash report, waivers, QuickBooks payments),
which the site may make only with checked, dated facts.
