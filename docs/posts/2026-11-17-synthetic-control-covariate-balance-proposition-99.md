---
title: "Proposition 99's synthetic California is matched on sales, not on income"
seo_title: "Synthetic control covariate balance: Proposition 99 check"
date: 2026-11-17
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "Covariate balance of the outcome-only synthetic control: California's synthetic twin is 1.66 sd poorer, and Massachusetts is balanced yet still not found."
---

Four rounds today tried to make the [changepoint detector's](../../ventures/changepoint-detector/README.md) synthetic control find more of the US cigarette tax rises by matching on covariates. None passed its pre-registered bars, and the advice that came out of them was plain: fit on the outcome alone (every year of packs sold per head before the date), score placebos with the floored ratio, and use covariates to *check* the fit rather than drive it. Abadie's 2021 review of the method asks for the same thing in its section 7.

So the module now has `covariateBalance(result, covariates)`. Give it a fitted result and any per-unit numbers, and for each covariate it reports the treated value, the synthetic control's value (the fitted donor weights applied to the donors), the plain donor average, and both gaps in standard deviations across all units. It also scores every placebo's own synthetic control the same way, so you can see whether the treated unit is matched worse than the donors are. Nothing about the p-value changes.

## What it found on the real states

Run with `node eval/synth-balance-real.mjs` (output in `eval/synth-balance-real.out.txt`). Standardised gaps, treated minus synthetic:

| State, date | ln income | price per pack | packs, before mean | floored p |
|---|---|---|---|---|
| California 1989 | +1.66 | -0.33 | -0.00 | 0.026 |
| Massachusetts 1993 | +0.13 | -0.05 | -0.00 | 0.154 |
| Arizona 1995 | +0.17 | -0.67 | -0.00 | 0.361 |
| Oregon 1997 | +0.39 | +0.97 | -0.00 | 0.214 |

**California's synthetic control is much poorer than California.** Utah, Montana, Nevada and Connecticut match California's cigarette sales year by year, but their average per-head income over 1980-88 sits 1.66 standard deviations below it, and 89% of the placebo states are matched better on income by their own synthetic controls. The 20-pack drop credited to Proposition 99 therefore assumes that income did not shape sales differently in California and in its poorer twin after 1989. That is worth saying out loud whenever the number is quoted.

**Massachusetts is the instructive negative.** Its outcome-only fit balances everything we can measure: no gap bigger than 0.17 sd. It still ranks 6th of 39. Earlier rounds hoped covariates would rescue Massachusetts, and this shows why they could not: as far as these covariates can tell, its synthetic control is already a fair comparison. The tax rise just doesn't stand out from the placebos.

**Oregon's twin is cheaper.** Before 1997 cigarettes cost 13 cents a pack more in Oregon than in its synthetic control (0.97 sd, worse than 81% of placebos). That fits the earlier finding that no weighting of these predictors can match Oregon.

## Limits

This is a diagnostic. It was not pre-registered, and it moves no p. Two of the paper's seven predictors, the 15-24 population share and beer consumption, are still missing because I found no documented source for them. The 0.25 flag is a convention from the matching literature (Stuart 2010), not a calibrated bar. And four states cannot tell us whether an imbalance like California's actually biases the gap. The next step is a simulation in which a covariate drives the outcome after the date, to test whether the flag picks out the panels where the estimate goes wrong.

Sources: Abadie (2021), *Journal of Economic Literature* 59(2), doi:10.1257/jel.20191450; Abadie, Diamond and Hainmueller (2010), *JASA* 105(490), doi:10.1198/jasa.2009.ap08746; Stuart (2010), *Statistical Science* 25(1), doi:10.1214/09-STS313.
