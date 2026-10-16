# Stripe Churn and Cohort Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/stripe-churn-cohort-analyzer/>

A free browser tool for subscription founders: **drop in a Stripe subscriptions
CSV export and see MRR, churn and cohort retention.** The file is read in the
browser; nothing is uploaded.

After using this, you can now **see which start-month cohorts keep their
customers, how much MRR you gained and lost each month, and whether churn is
concentrated in the first weeks**, which used to mean paying for a subscription
analytics vendor with access to your billing account, or building a pivot table
by hand.

## Input

Any CSV with a start/created date and an amount. Stripe's export headers
(`Start Date (UTC)`, `Created (UTC)`, `Canceled At (UTC)`, `Ended At (UTC)`,
`Amount`, `Interval`, `Interval Count`, `Quantity`, `Plan`, `Customer ID`,
`Status`) are recognised; near-synonyms work too. Rows that cannot be read are
listed with a line number and reason, never dropped silently.

## Outputs

- Monthly MRR waterfall: start + new − churned = end, reconciled every month.
- Logo and revenue churn over the last three complete months, implied lifetime,
  revenue LTV, quick ratio.
- Cohort retention table (logo retention by start month × months since).
- Findings: early-life churn share, rising or falling churn, single-customer
  concentration over 20% of MRR, large gaps in cancellation rate between plans.
- Download of the monthly table as CSV.

## Model (stated so you can disagree with it)

MRR per subscription is amount ÷ interval in months × quantity, held constant.
A subscription export carries no upgrade, discount or refund history, so
expansion and contraction are not modelled; a cancel-and-resubscribe shows as one
churn and one new subscription. Lifetime is 1 ÷ logo churn; LTV is revenue, not
profit.

## Run / test

Static ES modules, no build, no dependencies. `node --test`.

Licence: MIT. Not financial advice; see the disclaimers on the page.
