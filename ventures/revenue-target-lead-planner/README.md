# Revenue Target Lead Planner

A free browser tool for freelancers, agencies and small sales teams: **paste or upload your past weeks or months
(leads, deals won, revenue won), enter the revenue you want next period, and see your real conversion rate, the
chance of hitting the target, and how many leads give you a 50%, 80% or 90% chance.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/revenue-target-lead-planner/

After using this, you can now **set a lead-generation target that reaches your revenue goal most of the time, not
half the time**, which used to mean dividing the target by your average deal and your conversion rate and hoping.

## Model

- Input: rows of `period,leads,won[,revenue]` (a header may reorder the columns by name).
- Conversion is pooled wins ÷ leads. Uncertainty: 400 seeded bootstrap resamples of whole periods.
- Over-dispersion (Pearson) becomes a logit-normal spread on conversion, so lumpy histories get wider ranges.
- Next-period wins ~ Binomial(leads, conversion). Revenue = wins × average deal + deal-size noise estimated from
  how far each period's average deal sits from the pooled one.
- 1,500 simulated periods give the chance of reaching the target and the 10th-90th percentile outcome; the lead
  counts for 50/80/90% are found by search with common random numbers.
- Back-test: for each of the last min(4, periods/3) periods, refit on the earlier ones and check whether the real
  win count is inside the predicted 80% range. Misses produce a warning.
- Refuses: fewer than 6 periods, 60 leads or 10 wins, or a history with no variation.

## Limits

Sales-cycle lag, seasonality, lead source or quality, capacity limits and price changes are not modelled. Verified
only against simulated histories with known conversion and by the in-tool back-test.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
