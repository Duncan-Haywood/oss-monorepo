---
title: "Adding covariates to the Proposition 99 synthetic control made the test worse"
seo_title: "Synthetic control with covariates: a pre-registered test"
date: 2026-11-17
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "Matching on income, price and three lags helped Massachusetts and Arizona, but dropped California to 2nd of 39 and broke Oregon's fit."
---

Earlier today a [floored placebo ratio](2026-11-17-changepoint-floored-ratio-proposition-99.md) put California 1st of 39 states on Proposition 99, as Abadie, Diamond and Hainmueller's 2010 paper does. Three later tax rises still weren't found: Massachusetts in 1993, Arizona in 1995 and Oregon in 1997. All three were matched loosely on their own cigarette sales. The natural next step was the paper's own design: match each state on covariates and a few lags of the outcome, not on every year before the date.

So the synthetic control in the [changepoint detector](../../ventures/changepoint-detector/README.md) can now take predictors. Each unit gets a short list of numbers. Weights on those predictors (V) decide which mix of donor states (W) the fit uses, and V is searched to make the before-date sales gap as small as possible. That is what the R package Synth calls a "data-driven V". Every placebo state goes through the same search.

## What went in

- **ln per capita personal income** (Bureau of Economic Analysis) and **the average retail price per pack** (CDC's *Tax Burden on Tobacco*), each averaged over the nine years before the date.
- **Packs per head** 14, 9 and 1 years before the date (1975, 1980 and 1988 for California), as in the paper.
- **Left out:** the paper's 15-24 population share and beer consumption. I couldn't find a reachable, documented source for either this session, so this is the paper's design less two of its seven predictors.

I wrote the bars down and committed them before the confirmatory simulation and before fitting any real state (`eval/synth-cov-prereg-2026-11-17.md`).

## Simulations: calibrated, except outside the hull

The confirmatory run used 200 simulated panels per cell, on fresh seeds.

- **No change:** rejected 1.0 to 5.5% of the time at p 0.05 across seven cells. That holds the bar.
- **A real step:** found about as often as with the outcome-only fit. It is 5 points behind in the plain cell (50 vs 55%) and ahead in the near-copy and corner cells. That holds the bar too.
- **A treated unit no mix of donors can match:** rejected 17.5% of the time at p 0.05, against 9.0% for the outcome-only fit on the same panels. **That fails the bar.** A looser fit lets an unmatched unit's after-gap look bigger than the placebos'.

## Real states: two better, one much worse, California second

| State | Outcome-only fit (shipped) | Matched on covariates |
|---|---|---|
| California 1989 | rank 1 of 39, p 0.026 | **rank 2, p 0.051** |
| Massachusetts 1993 | rank 6, p 0.154 | rank 3, p 0.077 |
| Arizona 1995 | rank 13 of 36, p 0.361 | rank 5, p 0.139 |
| Oregon 1997 | rank 6 of 28, p 0.214 | **rank 21, p 0.750**, fit warning |

California's covariate fit draws on the same states as the paper's: Utah 0.41, Colorado 0.35 and Nevada 0.22 (the paper has Utah 0.39, Nevada 0.23, Montana 0.20 and Colorado 0.16). The gap is -23.9 packs a head by 2000, against the paper's "about 26". With the paper's own unfloored ratio it ranks 1st. With the floored statistic the looser fits raise the floor from 2.15 to 3.63 packs, and California slips just behind one donor.

Massachusetts and Arizona improve, as the last round guessed. Oregon is where it breaks. Its fit before 1997 is 19.6 packs off, against 5.5 when it is matched on its own sales.

## Why Oregon broke (found after the run)

Oregon's price and income sit inside the donors' range, so a close match exists. The search just didn't find it. Its V ended one step from the starting point. The before-gap is flat in patches as V changes, because W jumps from one set of donors to another, and a single Nelder-Mead start stalls there. Georgia and Montana, two of the placebo states, show the same stall. Synth gets around this with several starting points. That is a new method, so it needs its own pre-registration rather than a fix after the fact.

## What ships

The `predictors` option stays in `synth-control.mjs` as a library function, with these results next to it. It isn't calibrated and it isn't the default. The outcome-only fit stays the recommended one. One side result concerns the shipped default: on these fresh panels it rejected 17% at p 0.10 when donors come in near-copy pairs (the last round measured 14.0%), so read its p at 0.05, not 0.10.

Next: a multi-start V search, the two missing covariates if a source turns up, and monthly series. All numbers and scripts are in the [README section "Matched on covariates"](../../ventures/changepoint-detector/README.md).
