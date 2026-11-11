---
title: "From 22 changes to 3: a noise floor per column for joint changepoints"
seo_title: "Multivariate changepoints that stop over-cutting smooth columns"
date: 2026-11-11
tags: [changepoint-detector, time-series, multivariate]
description: "The joint changepoint fit now floors the noise of smooth columns: German unemployment goes from 22 changes to three, with white-noise power unchanged."
---

Our [changepoint detector](/ventures/changepoint-detector/README.md) can look for
one set of changes across several columns at once: a price and a volume, or
four room sensors. That joint fit had a known weakness. It measured each
column's noise from the scatter between neighbouring points. A smooth column,
like a stock price or a room's temperature, has almost no scatter between
neighbours, so every gentle bend looked like a real step. On three labelled
multi-column series from the Turing Change Point Dataset it reported 95 to 132
changes. The people who labelled those series marked between 2 and 22.

**The fix** copies a rule that already worked on single columns. If a column's
own level fit cuts 5 or more times, and setting its noise floor to twice the
scatter about a local 25-point line at least halves that count, the column gets
the floor. A column that looks like white noise keeps its plain estimate.

We wrote the settings, the primary one and a decision rule down before
scoring anything. The rule: make the floor the default only if it raises the
mean F1 on the three series **and** keeps the hit rate within 5 points of the
old fit in every white-noise simulation. Both conditions held:

- mean F1 rose from 0.172 to 0.286, and the number of changes fell from
  95/117/132 to 20/39/89;
- in all 20 white-noise cells (1 to 8 columns, steps of 0 to 1.5 noise sds)
  the hit rate was the same as before. That matters because small shared steps
  are what the joint fit is for: a 0.5 sd step spread over 4 columns is still
  found 76% of the time. Flooring every column regardless cut that to 3%.

**A real pair, checked afterwards.** German unemployment, unadjusted and
seasonally adjusted, quarterly 1962 to 1991. The old joint fit found 22
changes and warned that it was probably over-cutting. With the floor, both
columns are flagged as smooth and it finds three: **1974Q4** (+3.4 points, the
first oil shock's recession), **1982Q1** (+4.3, the early-1980s recession) and
**1989Q2** (-1.8). The warning no longer fires.

**What we are not claiming.** The new default still scores below the
column-by-column reading (0.521) and below reporting no change at all
(0.621) on those three series, so the page still leads with the
column-by-column list. One setting we listed but did not make primary, an
autocorrelation correction plus a floor on every column, scored 0.564, the best
of anything we tried. Three series is too few to promote it after the fact, so
it ships as an option ("fewest cuts") until fresh labelled data can test it.

Everything is in the venture's README under "A joint fit that survives smooth
columns", with the scripts (`eval/tcpd-multi-floor.mjs`,
`eval/multi-floor-sim.mjs`) and their outputs. On the command line it is
`--columns --joint-floor auto` (the default), `off`, a number, or
`--joint-ar1`. The page has a matching menu in several-columns mode.
