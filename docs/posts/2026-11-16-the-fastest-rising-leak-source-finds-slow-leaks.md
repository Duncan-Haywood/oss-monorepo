---
title: "Pick the fastest-rising leak source, not the newest: slow leaks found double, two bursts lost"
seo_title: "Leak localisation on BattLeDIM: rising sources find slow leaks"
date: 2026-11-16
tags: [research, water-leaks, BattLeDIM, leak-localisation, water-distribution]
description: "On BattLeDIM's L-Town, choosing the leak source whose flow rises fastest finds 6 of 17 slow leaks instead of 3, but misses two bursts: 14 of 32 in all."
---

The [water-leaks](../../research/water-leaks/README.md) programme studies leak
detection and localisation on BattLeDIM's L-Town, a simulated water network
with two years of sensor data and a published leak schedule. Nothing here is a
field result.

The [previous step](2026-11-16-the-leak-tracker-was-drowning-in-drift.md) ran a daily tracker on a residual with demand removed (an
oracle a real utility does not have). Each day it fits the network's pressure
anomaly as a sum of leak sources at junctions and dates each source by the day
it first appeared. Placing a new leak at the newest source found 13 of 32 leaks
within BattLeDIM's 300 m rule. The tracker did hold most slow leaks' sources,
but they entered about 18 days after the leak began, so a newer source usually
sat in front of them.

## The idea

A slow leak is a ramp. Its source should keep growing after it appears, while a
source that has soaked up an older leak or a one-off change should stay flat.
So, among the sources dated within the last 30 days, pick the one whose fitted
flow rose fastest over the last two weeks. The rule, its settings and five
predictions were written down before it was run.

## What happened

| estimate | within 300 m, of 32 | bursts, of 15 | slow leaks, of 17 |
|---|---|---|---|
| fastest-rising recent source | **14** | 8 | **6** |
| newest source (last step) | 13 | 10 | 3 |
| largest recent source | 11 | 8 | 3 |
| regression residual, no tracker | 15 | 10 | 5 |
| oracle: one leak's own effect | 28 | 13 | 15 |

Random junctions would manage 1.4. Slow leaks found doubled, from 3 to 6, the
most any data-driven estimate in the programme has placed. Bursts went the
other way, 10 down to 8, so the total moved by one leak. That is not
significant on 32 leaks (5 against 4 discordant, P = 1.0). Two of the five
predictions held.

Picking the *largest* recent source instead finds only 3 slow leaks. So the
gain comes from the rate of rise, not just from limiting the choice to recent
sources.

## What it means

The two rules find different leaks: the fastest-rising source gets 5 that the
newest misses (3 slow, 2 bursts), and the newest gets 4 bursts the other misses.
Between them they cover 18 of 32. Our reading, which this run did not test: a
burst's source jumps once and then stays flat, so a ramp running at the same
time outruns it on a two-week slope. The next step is to check each source's
shape, a step or a ramp, against the change being localised, and to take the
change's start time from a detector's alarm rather than the oracle hour used
here.

Code, results and the plan:
[`research/water-leaks`](../../research/water-leaks/README.md), step 22.
