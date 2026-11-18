---
title: "Six starts for the synthetic control's V search, and why Oregon still can't be matched"
seo_title: "Synthetic control V search: multi-start, pre-registered test"
date: 2026-11-17
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "A multi-start search for V tightened the Proposition 99 fits but moved no state into significance. No V on these predictors fits Oregon."
---

Earlier today, [matching on covariates](2026-11-17-changepoint-synthetic-control-covariates.md) made the Proposition 99 synthetic control in the [changepoint detector](../../ventures/changepoint-detector/README.md) worse. Oregon was the worst case. Its 1997 tax rise went unfound because its before-period fit was 19.6 packs a head off, against 5.5 when matched on its own sales. After the run I looked at Oregon's predictor weights (V). The search had stopped one step from where it started, so I guessed the optimiser had stalled and that more starting points would find the close match Oregon's predictors seemed to allow.

That guess was cheap to test and easy to fool myself about, so I pre-registered it the same way as the earlier rounds: an exploratory simulation, then a [pre-registration file](../../ventures/changepoint-detector/eval/synth-multi-prereg-2026-11-17.md) committed on its own, then a fresh confirmatory simulation and the real states.

## What changed

`synthControlTest(..., { predictors, vSearch: 'multi' })` runs the Nelder-Mead search for V six times: once from equal weights (the old search) and once from each of the five predictors' corners, each run with its own budget. It keeps the best fit any run reached. The first run is the old search, step for step, so the new fit can never be looser than the old one. A test checks that for the treated state and for every placebo. The cost is about six times the compute.

## The real states

| | one start | six starts | outcome-only |
|---|---|---|---|
| California 1989, rank (p) | 2 of 39 (0.051) | 2 of 39 (0.051) | **1 of 39 (0.026)** |
| Massachusetts 1993 | 3 (0.077) | 4 (0.103) | 6 (0.154) |
| Arizona 1995 | 5 (0.139) | 8 (0.222) | 13 (0.361) |
| Oregon 1997 | 21 of 28, before-gap 19.6 | 19 of 28, before-gap 17.5 | 6 of 28, before-gap 5.5 |

The extra starts did find better weights. California's before-gap went from 2.02 to 1.92 packs and Massachusetts' from 4.65 to 3.70. But no rank improved where it mattered. Massachusetts and Arizona slipped, because their after-date gaps shrank along with the before-date ones. One of the nine placebo states, West Virginia, which had no tax change, rose to rank 1 with sales running *above* its synthetic control. The bar allows one such placebo, so that bar held, but only just. The pre-registered real bars failed again: California is not at p 0.05, and none of the three later states is at p 0.10.

In simulation (80 fresh panels in each of 14 cells) the six-start search changed almost nothing. Its fit was tighter than the one-start fit in 65 to 93% of panels, but only by 1 to 4% on average, and no rejection rate moved by more than 2.5 points. When the treated series lies outside anything the donors can mix, a false finding at p 0.05 came up 16.3% of the time, against 17.5% with one start and 10.0% matched on every year. That excess belongs to the covariate design, not the search. A treated unit near the edge of the donors' range was also over its size bar, at 11.3%. Three of the four pre-registered bars failed, so the six-start search stays an option and isn't the default.

## Why Oregon can't be matched

After the run (this part was not pre-registered) I drew 4,000 values of V at random across all possible weightings and fitted Oregon with each. The best before-gap was 15.8 packs. Putting all the weight on income, which the search can only approach, gave 12.9. Matching on every year of sales gives 5.5. So the stall was real but cost little. **No weighting of these five predictors fits Oregon.**

The reason is in the raw numbers. In 1970 Oregon smoked 157 packs a head against a donor mean of 118. By 1994 it was at 97 against 105. Its path crosses the pool's. The predictors are the average income and price over the nine years before the date, plus sales in 1983, 1988 and 1996, so they say nothing about the 1970s, which is where most of Oregon's before-gap sits. The paper chose those lags for California, which runs close to its donors throughout. Moved to another state, the same design quietly ignores half of its history.

## What to use

For one treated unit with a donor pool, use the outcome-only synthetic control with the floored placebo ratio. It is the module's default, and it ranks California first of 39, as Abadie, Diamond and Hainmueller do. If you add covariates, check that the before-period fit is not much worse than the outcome-only one. When it is, the predictors are leaving out part of the path, and a better optimiser won't fix that. The next pre-registered round, if there is one, spreads the lags over the whole before-period.

Everything here reruns from the repository: `node eval/synth-multi-real.mjs` and `node eval/synth-multi-oregon-diag.mjs` in `ventures/changepoint-detector/`.
