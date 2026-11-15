---
title: "A week-old baseline cannot find a slow leak: 12 of 32 on BattLeDIM, against an oracle's 28"
seo_title: "BattLeDIM leak localisation with a moving baseline: 12 of 32"
date: 2026-11-15
tags: [research, water, leak-detection, digital-twin, BattLeDIM]
description: "On BattLeDIM L-Town, a residual a utility could compute (pressure against the same hours a week earlier) localises 12 of 32 leaks, and no lag does better."
---

Earlier today [step 17](/research/water-leaks/) of our leak programme set a
bar. On the BattLeDIM L-Town benchmark, if the pressure residual holds only
one leak's effect, a correlation localiser with the uncalibrated nominal model
puts **28 of 32 leaks within 300 m**. Building that residual took an oracle,
though: we replayed every other leak's published flow through the organisers'
own model. A utility has no list of its other leaks.

So step 18 asked the obvious practical question. Can a residual with no leak
list in it get anywhere near that bar? The simplest candidate is a moving
baseline: take the day's mean pressure at each of the 33 sensors and subtract
the same hours a week earlier. Old, steady leaks cancel, and so does the
weekly demand pattern. We wrote down five predictions before computing a
single lagged residual.

## The result

| residual (nominal model, q = 5 m³/h) | within 300 m | slow leaks (17) |
|---|---|---|
| pressure minus the same hours a week earlier | **12 of 32** | 4 |
| the same, with demand change removed by the leak-free model | 11 of 32 | 3 |
| regression residual (step 11) | 15 of 32 | 5 |
| one-leak oracle (step 17) | 28 of 32 | 15 |

Three predictions failed. The weekly difference does no better than the
regression residual (paired sign test P = 0.45), and no better than just naming
the sensor whose pressure fell most (12 of 32). Two held: the residual stays
far below the oracle, and removing demand change makes no difference. The loss
isn't demand.

Other lags fare no better. A one-day lag gets 12 (it keeps the abrupt leaks,
11 of 15, and loses nearly every slow one, 1 of 17). Three days gets 8, two
weeks 11.

## Why no window works

The published leak flows show what is in each window. Over a week, a slow
leak's own flow grows by a median 2.3 m³/h. In the same week the network's
other leaks change by a summed 2.7 m³/h. Only about a third of the slow leak's
growth since onset is still inside the window. A short window drops the old
leaks, but it also drops most of the slow leak. A long window keeps the slow
leak, but by then the other leaks have changed as well. In 2019, 23 leaks
overlap on L-Town, so no fixed window gives a slow leak to itself.

## What it means

A cheap moving baseline won't close the gap between today's practice (about
15 of 32) and what 33 sensors can resolve (28 of 32). The other leaks have to
be modelled rather than differenced away. One way is a sequential localiser
that subtracts the modelled effect of leaks it has already found. Another is
to fit several leak sources jointly to the residual. Either one has a clear
bar now.

Caveats: the localisation hour is still an oracle (when the leak reaches half
its peak flow), L-Town is a simulated network, and 32 leaks is a small sample.
Code, the plan as written before the run, and the per-leak table are in
[`research/water-leaks`](/research/water-leaks/) (step 18).
