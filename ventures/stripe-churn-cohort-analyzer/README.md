# Stripe Churn and Cohort Analyzer

A free browser tool for subscription founders: **drop in a Stripe subscriptions
CSV export and see MRR, churn and cohort retention.** The file is read in the
browser; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/stripe-churn-cohort-analyzer/

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
- Churn-reduction value: 12-month MRR with churn lowered by N points against today's churn, in the page and with `--what-if`.
- Download of the monthly table as CSV.

## Command line

The same analysis in a terminal, zero dependencies, nothing sent anywhere:

```
node cli.mjs subscriptions.csv --cohorts
node cli.mjs subscriptions.csv --what-if 1     # value of cutting monthly churn by a point
node cli.mjs subscriptions.csv --max-churn 5   # exit 1 if monthly logo churn > 5%
node cli.mjs --example                          # try it on synthetic data
```

`--max-churn` suits a monthly cron or CI job. Comparison with connected
subscription-analytics products, and when a CSV is not enough:
[vs-chartmogul-baremetrics.html](vs-chartmogul-baremetrics.html).

## Model (stated so you can disagree with it)

MRR per subscription is amount ÷ interval in months × quantity, held constant.
A subscription export carries no upgrade, discount or refund history, so
expansion and contraction are not modelled; a cancel-and-resubscribe shows as one
churn and one new subscription. Lifetime is 1 ÷ logo churn; LTV is revenue, not
profit.

## Run / test

Static ES modules, no build, no dependencies. `node --test`.

Licence: MIT. Not financial advice; see the disclaimers on the page.
