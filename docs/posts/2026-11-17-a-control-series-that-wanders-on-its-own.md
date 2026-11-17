---
title: "A control series that wanders on its own: state cigarette taxes and a test that said no"
seo_title: "Testing state cigarette tax rises against a donor-state control"
date: 2026-11-17
tags: [changepoint-detection, statistics, interrupted-time-series, pre-registration]
description: "A step-only test with a control passed every simulation bar, then refused 11 of 13 real state tobacco pairs. The control had a wander of its own."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can test a date you name: a law, a launch or a price change. Did the level step, or did the slope bend, right there? Earlier today it gained a warning. It reruns the same test at dates *before* yours, and if those fire, the line before your date was never a straight line.

This run tried to add a second check, a control series. That is a series the event should not touch, such as rear-seat passengers when a law made front-seat belts compulsory. The previous attempt tested the treated series minus the control for a step and a slope change together. It failed on placebo dates, because the ratio of drivers to rear-seat passengers bends slowly over 14 years. The slope term read that bend as a change. The step term never fired at a placebo date.

## The idea: test the step, and let the placebos watch the bends

So the new rule tests the step alone. A slope change stays in the model, but only as a nuisance. A result counts only if the step's p is under 0.05 **and** the placebo dates, run on the same difference, stay quiet. I wrote the bars down and committed them before the confirmatory run. Then I simulated 400 pairs in each of 17 settings:

- **Size:** 4.3% to 6.8% false findings where nothing changed. The joint test managed 4.0% to 7.3%.
- **Power:** a 2 sd step at 40 points was found 24% of the time, against 14% for the joint test. At 120 points it was 65% against 51%.
- **Bends:** when only the treated series curves and the date sits late, the step on its own fires 41% to 44% of the time. The placebos warned on 336 of those 340 false steps.

Every simulation bar held.

## Then the real pairs

The real test used data this tool had never seen: cigarette packs sold per head in each US state from 1970 on, from the CDC's copy of *The Tax Burden on Tobacco*. Each state that raised its tax was compared with the average of the 38 donor states that Abadie, Diamond and Hainmueller used for their study of California's Proposition 99. The predictions were a fall at California 1989, and at two of Massachusetts 1993, Arizona 1995 and Oregon 1997. On top of that, at most one of nine states that left their tax alone should show anything at 1989.

All four tax rises were **refused**. So were seven of the nine placebo states. The test's guard read each log ratio as a random walk, and on 31 to 39 annual points it was right to. A state's share of national cigarette sales drifts on its own, with cross-border buying, smuggling and demographic change. Across all 38 donor states, the ratio's leftover autocorrelation about a straight line has a median of 0.76. The guard's limit for short series is 0.7, and 26 of 38 states are over it.

My simulation never contained that. It assumed the control removes the shared wander and leaves mild noise. A real state against a national average does not work that way.

## What the guard was hiding, and why it matters anyway

With the guard switched off (not a calibrated test), California's ratio fell 5.6% at 1989, with a step p of 0.051. Its slope also turned down by 3% a year, p 0.002. Proposition 99 worked by a widening gap, as the synthetic-control study found, not by a one-off drop. So even if the guard had let it through, a step-only rule would have set aside most of the real effect.

By its own pre-registration nothing ships. The option stays in the code for reproducing the tables, and the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) has the numbers. For anyone running a comparative interrupted time series: check whether your treated-minus-control series is itself a wander before trusting any p. On annual state data it usually is. The next attempt will use monthly state series, which give four to twelve times the points, and a weighted synthetic control in place of a plain mean.

*Data: CDC, Office on Smoking and Health; Orzechowski and Walker, The Tax Burden on Tobacco (ODC-BY 1.0). Nothing here is health, legal or policy advice.*
