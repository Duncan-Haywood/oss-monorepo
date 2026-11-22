---
title: "A rule read off old data meets 50 years of US recessions, and loses"
seo_title: "Testing a changepoint routing rule on NBER recession dates"
date: 2026-11-22
tags: [changepoint-detection, statistics, pre-registration, state-space-models]
description: "A post hoc rule for smooth series, tested on seven US activity series against NBER peaks and troughs: F1 fell from 0.329 to 0.222."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/README.md) tried a second model for
series whose level drifts: a smooth trend, where between changes the level follows a slope and the slope itself
wanders. On the labelled series it had been scored on before (the Turing Change Point Dataset), it fell short of its
pre-registered bar by 0.002 F1. Reading the results afterwards, a cleaner story turned up. On the series where the
existing drift model's noise estimate hits its floor, and the smooth-trend model's does not, the smooth trend won 10
series and lost 4.

A pattern found after the fact on the same series is a hypothesis, not a result. The note said so, and asked for
fresh labelled series. This run went looking for them.

## Where the rule reaches

The first candidates were textbook series with one documented event: German money supply around the 1990 monetary
union, Boston youth homicides around Operation Ceasefire, US airline miles around September 2001, and two more road
casualty series from the 1983 seat-belt law. None of them sets the rule off. Their noise estimates stay off the
floor, so the rule would leave every one with the model that already ships.

The series the rule does route are smooth US aggregates: GDP, consumption, investment, income, unemployment. They
have an outside label set with dates nobody here picked: the NBER business-cycle peaks and troughs. Seven series
were chosen before any fit, and the bars were written into the script and committed before it first ran.

## What happened

| | shipped drift model | routed (smooth trend) |
|---|---|---|
| mean F1, 7 series | 0.329 | 0.222 |
| wins / losses | | 2 / 5 |
| turning points within 5 steps of a cut | 29 of 110 | 16 of 110 |

All three bars fail. The losses are large where they matter: on the unemployment rate the shipped model cuts at the
1975, 1980-82 and 2008-09 rises, and the smooth trend makes two cuts in fifty years.

The reason is visible in the fit. The smooth-trend model picks how much the slope may wander by likelihood. On these
series it chooses a wander close to the noise itself, so the slope can turn hard within a quarter or two, and a
recession becomes a slope move rather than a change. The simulation had flagged the same weak spot: with a fast slope
wander it found a 4-sigma step only 38% of the time.

## What changes

Nothing in the tool. The rule is retired: it came from 17 series it was read off, and it loses on the first fresh set
it reaches. The next attempt, if there is one, caps the slope's wander at a stiff value chosen in simulation first,
so that turning costs a cut. Everything is in the README section "The trend-walk route on fresh series", with the
script, its output and a test that reruns it.

One caveat about the labels. Neither model is built to find turning points, and both cut where no recession explains
it (the late-1990s run-up in GDP). These labels score each model on the changes these series are known to have.
They are not a test of jump detection alone.
