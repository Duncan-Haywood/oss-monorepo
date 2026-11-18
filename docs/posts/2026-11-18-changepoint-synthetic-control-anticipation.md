---
title: "When people see the change coming: backdating a synthetic control, tested"
seo_title: "Synthetic control anticipation: backdating, pre-registered"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "An effect that starts 2-4 points early loses up to three fifths of a synthetic control's power. Backdating wins it back; the placebo warning half-holds."
---

A law passes in November and takes effect in January. A price rise is announced a quarter early. People react before the date, and any method that fits a counterfactual on "everything before the date" quietly fits part of the effect away. Abadie's 2021 review of the synthetic control method says to backdate the intervention to the first point people could react. The [changepoint detector](../../ventures/changepoint-detector/README.md)'s synthetic control had no way to do that, and no number for what skipping it costs.

So I measured it the same way as the [last](2026-11-17-changepoint-synthetic-control-proposition-99.md) few rounds. I ran an exploratory simulation, committed a [pre-registration](../../ventures/changepoint-detector/eval/synth-anticip-prereg-2026-11-18.md) on its own, then ran a fresh confirmatory simulation with 400 panels a cell.

## What anticipation costs

Each panel has 39 units, 19 points before the stated date and 12 after. The treated unit drops by 1 (about two noise standard deviations), starting either on the date or 2 or 4 points before it. The panel is scored at the stated date and again backdated by 2 and by 4.

| the drop began | found at the stated date | backdated 2 | backdated 4 |
|---|---|---|---|
| on the date | 61.8% | 52.0% | 43.3% |
| 2 points early | 39.8% | **55.0%** | 45.8% |
| 4 points early | 25.3% | 35.3% | **53.5%** |

Two points of anticipation cost a third of the power, and four points cost three fifths. The gap measured from the date shrinks by 14 to 25%. Backdating by the true lead brings both back. Backdating when nothing was anticipated costs 10 to 18 points, because the fit is shorter. That is why the lead should come from what you know about the change (when the law passed), not from trying several leads and keeping the smallest p.

## A failed bar: the placebo warning

The balance table's placebo warning flags a covariate on which the treated unit is matched worse than 80% of the donors. In earlier rounds it held almost every false finding when a covariate moved the outcome from the date onward. Here, when the covariate moved 4 points *before* the date, warned panels were still 2.4 times as biased, but the warning caught only 4 of the 8 false findings. The pre-registered bar wanted a 5-point gap in false-finding rates and got 3.9, so it failed. The fit had seen four shifted points and matched part of the covariate through the outcome, so some biased panels no longer looked imbalanced. Fitted from before the covariate moved, the warning caught 8 of 8. The CLI and the page now say its calibration holds for shocks that start at the date.

## What shipped

`node cli.mjs panel.csv --column CA --known-date 1989 --donors all --anticipation 1` ends the fit one point before the named date. It reads the gap and the placebo test from there and still reports the mean gap from the named date. The [web page](../../ventures/changepoint-detector/index.html) has the same box, "Points people saw it coming". On Proposition 99, which voters passed in November 1988 for a January 1989 tax, backdating one or two years leaves California at rank 1 of 39 (p 0.026). The published result does not depend on a year of anticipation.

Limits: one panel shape, step effects, and a lead known exactly. Next is a lead you only know roughly, which means reporting a range of backdates together without picking the best one.
