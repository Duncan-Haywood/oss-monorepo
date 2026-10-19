# Project Estimate Calibrator

A free browser tool for freelancers, agencies and contractors: **paste or upload a CSV of finished projects (estimate and
what it actually took) and get calibrated 50/70/80/90% outcomes for your next estimate, the buffer and fixed price that
covers them, the chance a fixed price loses money, and a back-test on your most recent projects.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/project-estimate-calibrator/

After using this, you can now **quote a fixed price with a buffer taken from how your own estimates have actually
missed, and know the chance it still loses money**, which used to take a gut feeling of "add 20%".

## Model

- Input: rows of `estimate,actual[,type]` (a header may reorder the columns by name). Hours or dollars, one unit.
- `ln(actual) = a + b·ln(estimate) + noise`. `b = 1` (a plain overrun ratio, `a` = median log ratio) unless n >= 20
  and the slope differs from 1 by more than two standard errors, in which case overruns are allowed to grow with size.
- Quantiles at 70/80/90/95%: the `ceil((n+1)p)`-th smallest residual (split-conformal correction), no normality assumed.
  A level n cannot support is flagged. 300 seeded bootstrap resamples give the 80% ranges.
- Fixed-price loss chance: share of residuals pushing `actual × rate` above the price, `(k+1)/(n+1)` so it is never 0.
- Refuses: fewer than 12 projects, or actuals that equal estimates. Warns on estimates outside the past range.
- Back-test: fit on the first 75% in the order given, score the last 25% (share under the predicted 80% level; log error
  versus assuming actual = estimate).

## Pricing a whole project from its tasks

Paste a task list (`name, estimate` per line) and the tool sums the tasks two ways, both from your own residuals: **shared miss**
(one past residual applied to every task, because a bad project is bad everywhere) and **independent** (20,000 seeded draws, one
residual per task, so misses cancel). Price from the shared view unless the tasks are unrelated. A flat buffer on every task only matches the
shared view; the page shows how much it over-pads if tasks miss independently. Your history should be at task size for this to be reliable; it warns when
a task falls outside the range seen.

## Limits

Correlation with your own past. Scope changes, new kinds of work, changed estimating habits and client effects are not
modelled. Verified only against simulated histories with known overruns. Statistical estimate from your data, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
