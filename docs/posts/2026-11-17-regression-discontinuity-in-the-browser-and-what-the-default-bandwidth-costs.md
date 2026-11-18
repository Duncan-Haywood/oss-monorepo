---
title: "Regression discontinuity in a browser tab, and what the default bandwidth costs in coverage"
seo_title: "Free regression discontinuity tool: robust bias-corrected RD online"
date: 2026-11-17
tags: [regression-discontinuity, causal-inference, policy-evaluation, research-algorithms, browser]
description: "A free RD tool matches rdrobust within 1e-8 at fixed bandwidths. On 500 shared simulated samples its own bandwidth covered 93.2% against rdrobust's 91.8%."
---

A regression discontinuity design asks whether crossing a threshold changed
an outcome. A scholarship goes to scores of 80 and up, a subsidy to incomes
under a line, a seat to whoever wins by any margin. Units just either side of
the cutoff are alike except for the side they landed on, so the jump in the
average outcome at the cutoff estimates the effect for units near it.

The new [regression discontinuity tool](../../ventures/regression-discontinuity/)
does this in the page, the command line or an agent call. Nothing is
uploaded. You give it one row per unit, the running variable, the cutoff and
the outcome, plus a take-up column if crossing the cutoff only raises the
chance of treatment. It reports:

- the local linear (or polynomial) jump, with the **robust bias-corrected
  interval** of Calonico, Cattaneo & Titiunik (2014) next to the conventional
  one;
- an MSE-optimal bandwidth, or one you choose;
- the fuzzy estimate (the outcome jump divided by the take-up jump) and its
  first stage;
- the checks a referee asks for: the estimate from half to twice the
  bandwidth, placebo cutoffs at the median of each side, covariates that
  should not jump, and McCrary's (2008) test for units bunching on one side.

## Why three estimates

The conventional interval fits a line on each side and reads off the gap. At
the bandwidth that minimises mean squared error, the fit's bias is the same
order as its standard error, so the interval is centred in the wrong place
and covers the truth less often than 95%. Calonico, Cattaneo & Titiunik
subtract an estimate of the bias, from a quadratic fit with a second
bandwidth, and then widen the standard error to count the noise in that bias
estimate. The tool writes each estimate as an explicit weighted sum of the
outcomes, so the robust variance is just the sum of squared weights times
residual variances.

## Checked against the reference implementation

The method's authors maintain rdrobust. It is GPL-3.0 and this repository is
MIT, so the engine was written from the papers, and rdrobust 2.1.1 was only
run as an outside program to record numbers. On 14 fixed-bandwidth cases the
conventional, bias-corrected and robust estimates and standard errors all
agree within 1e-8. The cases cover sharp and fuzzy designs, polynomial orders
0 to 3, three kernels, nearest-neighbour and HC0 to HC3 variances, and an
integer score with ties.

Two details had to be found by comparison, not from the papers. First, only
units within the larger of the two bandwidths enter, and the nearest
neighbours are matched inside that window. Second, HC1's small-sample factor
counts that window, not the units with positive weight. The fuzzy
bias-corrected estimate linearises the bias of the ratio. Taking the ratio of
the two corrected jumps instead was 0.0028 off.

The automatic bandwidth is the one place the tool does not match. Its
plug-in, with pilot fits for each derivative and a regularisation term, is
this run's own reading of the papers. On six test designs it lands at 0.75 to
1.06 times rdrobust's `mserd` bandwidth. If you type rdrobust's h and b into
the page, you get rdrobust's numbers.

## What the default bandwidth costs

A different bandwidth only matters if it changes how often the interval is
right, so the run checked coverage. It drew samples from the Lee (2008)
House-election calibration that Calonico, Cattaneo & Titiunik use in their
simulations, where the true jump is 0.04:

| 500 shared samples of 1,000 | mean h | robust 95% covers | conventional 95% covers |
|---|---|---|---|
| rdrobust 2.1.1, default bandwidth | 0.199 | 91.8% | 89.2% |
| this tool, its own bandwidth | 0.172 | 93.2% | 91.0% |

The Monte Carlo standard error of each coverage figure is about 1.1 points,
so the gap between the two tools is suggestive, not established. Two things
hold either way. The robust interval beats the conventional one by about two
points in both tools, as the paper predicts. And neither reaches 95% at
n = 1,000 on this curve, which has a large second derivative on the left of
the cutoff. On a separate 1,000 draws (seed 7) the tool's robust interval
covered 93.7% and the conventional 91.7%. The scripts are in `eval/`.

## The density check nearly misfired

The first version checked for sorting with the simplest test: in a window
around the cutoff, are units split about evenly? On the example it flagged
the design at p = 0.001. Nothing had sorted. The running variable is a
skewed Beta draw whose density falls through the cutoff, so any wide window
holds more units on the denser side. McCrary's test fits the histogram on
each side instead. It gives p = 0.25 on the example and p = 5e-7 when half
the units just below the cutoff are moved just above. The window counts are
still on the page, with a note that a sloped density tilts them.

## Try it

The example is 1,000 simulated close elections with a true jump of 0.04.
This draw estimates 0.088. The robust interval, 0.005 to 0.169, still covers
the truth, the bandwidth sweep keeps the estimate between 0.088 and 0.103,
and every check is clean. That is a fair picture of how much a sample of
this size near a cutoff can tell you.

Next for the tool: covariate adjustment (Calonico, Cattaneo, Farrell &
Titiunik 2019), the local polynomial density test of Cattaneo, Jansson & Ma
(2020), and local randomisation inference for scores with few distinct values.

*Statistical estimates from the data you supply; not legal, financial,
medical or policy advice.*
