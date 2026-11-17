---
title: "Staggered difference-in-differences in a browser tab, and the year before adoption"
seo_title: "Free staggered difference-in-differences: Callaway-Sant'Anna online"
date: 2026-11-17
tags: [difference-in-differences, causal-inference, policy-evaluation, research-algorithms, browser]
description: "A free DiD tool matches R's did to 1e-9. On castle-doctrine data, TWFE says 0.069 and the clean estimator 0.019; the year before adoption explains most of it."
---

Difference-in-differences is the workhorse of policy evaluation: compare how
the outcome changed for units that adopted something with how it changed for
units that did not. With one adoption date that is a four-number calculation
(Card & Krueger 1994). Most real adoptions are staggered: states pass a law in
different years, stores roll out a layout over months. The usual answer, a
regression of the outcome on a treatment dummy with unit and year effects
(two-way fixed effects, TWFE), turned out to be a weighted average of many
small comparisons, some of which use units *already treated* as controls
(Goodman-Bacon 2021). If the effect grows or fades, those comparisons subtract
part of it.

The new [difference-in-differences tool](../../ventures/difference-in-differences/)
runs both views in the page. Upload a long panel with the first treated period
of each unit, and it gives:

- the group-time effects ATT(g,t) of Callaway & Sant'Anna (2021), one clean
  2x2 comparison per cohort and period, against never-treated or not-yet-treated
  units, aggregated overall, by time since adoption (an event-study plot with a
  simultaneous band) and by cohort;
- a joint pre-test of parallel trends;
- the TWFE estimate with clustered standard errors and its Goodman-Bacon
  decomposition: every 2x2 comparison inside it, with its weight.

The same engine is a zero-dependency CLI (`node cli.mjs --example`) and an
agent call. Nothing is uploaded.

## Checked against the reference implementations

`eval/reference.py` runs csdid 0.4.5, a Python port of R's `did` package, and
pyfixest 0.70.0 on two panels and writes the numbers the tests read. On both,
every ATT(g,t), its standard error, the three aggregations and every
event-time and cohort row agree within 1e-9, for never-treated and
not-yet-treated controls and both base-period conventions. The pre-test
statistic agrees where csdid reports one (28.55 on 15 df on the simulated
panel), and the TWFE coefficient and clustered standard error agree with
pyfixest within 1e-9. The decomposition is checked differently: its weights
must sum to one and rebuild the TWFE coefficient exactly, which they do on 25
random panels.

## What the example shows

The example is Cheng & Hoekstra's (2013) castle-doctrine panel as packaged in
the MIT-licensed `causaldata` Python package: log homicide rates for the 50
states, 2000-2010, with 21 states first under a castle-doctrine law for a full
year between 2006 and 2010. The tool uses no covariates, population weights or
region-by-year effects, so this is not the paper's specification and the
numbers below are not a finding about the laws. They are what the two
estimators say about the same data.

- **TWFE says 0.069** (SE 0.056). The decomposition puts 89.9% of the weight
  on treated-vs-never-treated comparisons, which average 0.078. Only 2.4% sits
  on the "later vs already treated" comparisons, so the forbidden-comparison
  problem is small here.
- **The group-time estimator says 0.019** (95% CI -0.056 to 0.095).

So where does the gap come from, if not the forbidden comparisons? The base
period. A 2x2 inside TWFE compares the post-adoption years with the average
of *all* pre-adoption years. ATT(g,t) compares them with the year just before
adoption. The event study shows treated states' log homicide rate already up
relative to the controls in that year (e = -1: 0.097, 95% CI 0.020 to 0.175).
Measured from that higher base, little is left afterwards. Whether that rise is
noise, anticipation, or the kind of rise that leads states to change the law,
the data cannot say. The tool lets you set an anticipation window to treat
that year as already affected.

## A warning the tool learned to give

Two of the five cohorts contain one state each. That breaks the standard
errors quietly. With a single unit there is no way to estimate how much it
moves by chance, so its estimates' standard errors reflect only the comparison
group. One of those states has a log homicide rate that swings by more than
0.5 from year to year, yet its pre-treatment estimates came back with standard
errors near 0.04. An event-time pre-test built on them rejected parallel
trends at p of about 1e-46, which is nonsense. R's `did` reports no
group-time pre-test here, but because the covariance is singular, not because
of the one-state cohorts.

The tool now says so and reports no pre-test when a cohort has one unit. A
"minimum cohort size" option drops such cohorts. With it set to 2, the
overall effect is 0.005 (CI -0.068 to 0.078), and the pre-test, on the
event-time averages because the group-time covariance is still singular,
rejects parallel trends (chi-square 20.95 on 8 df, p = 0.007).

## Next

Covariates through the doubly robust estimator (Sant'Anna & Zhao 2020), the
imputation estimator of Borusyak, Jaravel & Spiess (2024) as a second clean
estimator, and HonestDiD bounds (Rambachan & Roth 2023), which ask how large a
violation of parallel trends would have to be to overturn the result: the
question the castle example leaves open.

Free and MIT licensed. Statistical output from data you supply, not legal or
policy advice. Not affiliated with the cited authors or with the did, csdid,
fixest or pyfixest projects.
