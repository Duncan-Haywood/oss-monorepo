---
title: "A stiff slope hears recessions: a change detector finds business-cycle turns, and why it still did not ship"
seo_title: "A stiff-slope trend model finds recessions, not jumps"
date: 2026-11-23
tags: [changepoint-detection, statistics, pre-registration, business-cycles]
description: "Capping how fast a trend may turn let a change detector find US recessions far beyond chance, but it over-cut 14 of 21 labelled jump series."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a model for series whose level
moves smoothly between changes: a trend whose slope is allowed to wander. Last round it failed on US activity
series dated by the NBER's business-cycle committee. It let the slope wander so freely that a recession looked like
just another bend in the trend, and it made one or two cuts on fifty years of GDP.

The obvious fix is to make the slope stiff. Cap how far it may wander, and a recession has to be paid for as a
change. The risk is just as obvious: a stiff slope may chop every smooth series into pieces. So we wrote the test
down first, in the header of `eval/trend-walk-stiff.mjs`, and committed it before the script ran.

## Choosing the cap without looking at real data

The cap was chosen in simulation only. We tried five values on synthetic trends: a slow-turning trend with no
change, the same trend with a level step, a fast-turning trend with a step, and a trend whose slope kinks once.
The rule was to keep the caps that make at most 0.15 false cuts on the quiet series and take the one with the best
power on the hard cells. That rule picked a slope wander of 3e-4 noise variances a step. On fresh seeds it made
0.01 false cuts on each quiet series. It found 82.5% of steps on a fast-turning trend, where the uncapped model
found 48%.

## Three real tests

1. **Fresh series no model here had seen:** monthly US industrial production 1947-2004, the same index quarterly
   1960-1991, and the number of people unemployed 1967-2015. The labels are NBER peaks and troughs. Mean F1 rose
   from 0.474 to 0.640, with 3 wins and no losses. The shipped model was within five months of 19 of 46 turning
   points. The stiff one was within five months of 45.
2. **Last round's seven series:** F1 rose from 0.329 to 0.645, 7 wins and no losses.
3. **The Turing Change Point Dataset's 21 smooth series, where annotators mark jumps:** the stiff model had to do no
   worse here. It did worse: F1 fell from 0.605 to 0.499, with 14 of the 21 series lost. US population got 37 cuts
   where the shipped model makes none.

The rule was that all four bars pass or nothing ships, so nothing ships. The default stays as it is, and the cap is
an option in the module for later rounds.

## Is it just cutting more?

A model that cuts more often lands near more labels by luck. After the run we checked this. For each series we
scored the same number of cuts placed at random. The stiff model beat its own random baseline on all ten
NBER-labelled series, by 0.21 F1 on average. The shipped model beat its baseline on 6 of 10, by 0.02. So the stiff
model's cuts really do sit on recessions. This check was not registered, so it counts as a reading, not a result.

So the stiff model is good at one job and bad at another. It hears turning points in activity data and over-cuts
smooth series whose labels are jumps. If a turning-point option is built, it needs its own test on another
country's dated cycle, with the random-cut baseline as one of the bars written beforehand.

The numbers are in the venture's README, under "A stiff slope". The data and scripts are MIT licensed and run in
about 20 seconds.
