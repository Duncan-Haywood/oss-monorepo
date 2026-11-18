---
title: "Slow leaks look like ramps, but timing the ramp against the alarm loses them again"
seo_title: "Leak localisation on BattLeDIM: step or ramp shape fits"
date: 2026-11-17
tags: [research, water-leaks, BattLeDIM, leak-localisation, water-distribution]
description: "On BattLeDIM's L-Town, a step-or-ramp fit labels every slow leak's source a ramp, yet timing it against the alarm finds 3 of 17 slow leaks, not 6."
---

The [water-leaks](../../research/water-leaks/README.md) programme studies leak
detection and localisation on BattLeDIM's L-Town, a simulated water network
with two years of sensor data and a published leak schedule. Nothing here is a
field result.

Two earlier rules split the leaks between them. A daily tracker fits the
network's pressure anomaly as a sum of leak sources and dates each one. Picking
the newest source finds bursts (10 of 15 within 300 m) but few slow leaks
(3 of 17). Picking the [fastest-rising recent source](2026-11-16-the-fastest-rising-leak-source-finds-slow-leaks.md)
finds 6 slow leaks but loses two bursts. Between them they cover 18 of 32 leaks.

## The idea

A burst should look like a step and a slow leak like a ramp. So fit each source
dated in the last 30 days with both shapes, keep the better fit, and time its
change: a step at the day it starts, a ramp at the day it reaches half its
level. The alarm used here is the hour the leak reached half its peak, so that
looked like the matching definition. Then pick the source whose change is timed
nearest the alarm. The rule and five predictions were written down before it
was run.

## What happened

| estimate | within 300 m, of 32 | bursts, of 15 | slow leaks, of 17 |
|---|---|---|---|
| shape-timed change nearest the alarm | 13 | 10 | 3 |
| fastest-rising recent source (last step) | 14 | 8 | **6** |
| newest source | 13 | 10 | 3 |
| oracle: one leak's own effect | 28 | 13 | 15 |

The shape fit itself worked. Each of the 8 slow leaks with a dated source within
300 m had that source fitted as a ramp. Ramps were rare among the candidates,
about 1 in 6. But the rule found 3 slow leaks, the same as "newest source", and
it differs from that rule by one leak each way. Three of the five predictions
failed.

The reason shows in the timing. When the alarm fires, a slow leak is still
growing. Half of today's level was reached days ago (a median 4.2 days before
the alarm). The alarm is half of a peak that hasn't arrived yet. So the newest
source, a step that started yesterday, always sits nearer the alarm. Our timing
definition only matches a ramp that has already peaked.

## What it means

The shape label is worth keeping and the timing is not. The next test, to be
written down before it is run: use the shape to choose the score, the steepest
ramp when one exists and the newest step otherwise. Timing should come from a
real detector's alarm, which marks when a leak became visible. It should not
come from this oracle half-peak hour.

Code, results and the plan:
[`research/water-leaks`](../../research/water-leaks/README.md), step 23.
