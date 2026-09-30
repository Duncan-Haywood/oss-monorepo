# Ad Spend Saturation Analyzer

A free browser tool for advertisers, agencies and e-commerce owners: **paste or upload a CSV of date, channel, spend
and revenue and see where each channel stops paying for itself, what the next dollar returns, and a better split of
your budget.** It fits a diminishing-returns curve per channel, reports the marginal ROAS with a bootstrap range, finds
the spend where the channel falls below break-even for your gross margin, and says "unclear" when the data does not
support a call. Nothing is uploaded.

After using this, you can now **tell whether the next ad dollar on a channel pays for itself, and move budget between
channels without guessing**.

## Model

- Input: rows of `date, channel, spend, revenue` (header optional; `spend,revenue` alone also works for one channel).
  Duplicate date+channel rows are summed; weekly grouping is optional. At least 20 periods per channel and real
  variation in spend (distinct levels and a coefficient of variation of at least 0.15) are required; otherwise the
  channel is held at its current spend and the page says why.
- Two curves per channel, both by least squares: linear (`base + slope * spend`) and saturating
  (`base + a * (1 - exp(-spend / k))`, `k` by a 48-point geometric grid). Base and scale are constrained non-negative.
  The saturating curve wins only if its 10-fold cross-validated RMSE beats the line by 2% and `k` is not at the edge of
  the grid.
- Marginal ROAS is the curve's slope at current spend (the mean of the most recent quarter of periods). The 80% range
  is the 10th to 90th percentile across 200 bootstrap refits (100 above 500 periods), seeded so a rerun gives the same
  answer. Verdict: scale up when at least 80% of resamples are above break-even, pull back when at most 20%.
- Break-even marginal ROAS is `1 / gross margin`. Budget is handed out in steps to the channel with the highest next-step
  return, stopping below break-even, with each channel limited to -50% / +50% of current spend and never far beyond the
  highest spend tested. Predicted gain is `margin * change in revenue - change in spend` with the share of resamples
  where it is positive.
- Warns when spend on two channels is correlated above 0.8, since their effects cannot be separated.

Not modelled: carry-over and lag, seasonality and promotions that move spend and revenue together, channel overlap,
auction repricing at scale. The history is observational, so a curve is a hypothesis to test with a holdout.

Unverified: the code is tested on simulated channels with known curves (the 80% range covered the true marginal ROAS in
47 of 60 simulated datasets), not on a published dataset or against a commercial media-mix tool.

## Run and test

Static ES modules, no build and no dependencies.

```
node --test
```

Open `index.html` in a browser. Nothing is sent anywhere; usage counters live in local storage only and are off under
Do Not Track.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax or financial advice. You are responsible for
verifying its output. MIT licensed.
