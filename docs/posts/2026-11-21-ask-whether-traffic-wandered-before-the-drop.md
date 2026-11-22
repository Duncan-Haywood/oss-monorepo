---
title: "Ask whether traffic wandered before the drop, not after it"
date: 2026-11-21
tags: [change-detection, search-console, monitoring, statistics, pre-registration]
description: "A traffic alert's wander gate now reads the days before a change, so calm sites keep every small fall while drifting sites still get half the alerts."
---

This morning the [change watch](../../ventures/changepoint-detector/watch-a-metric-for-changes.html)
got an opt-in for counts that drift: `--wander gated`. Traffic that wanders
with seasons and news looks like a staircase to a step detector, and every new
stair becomes an alert. The gate fits a random-walk level to the log counts.
When that fits clearly better than a flat level with jumps, it keeps only the
changes the random-walk model also calls jumps.

It worked on drifting sites, but it failed one pre-registered bar. On calm
simulated sites, some slow 10% falls were never heard. The reason was simple
once we looked. A small fall is noticed late, so on the day the watch would
report it, the fall sits at the very end of the window. Fitted over that
window, the random walk explains the fall as one more bit of wander. The gate
opens and removes the only change it was meant to protect.

## Five fixes, probed

Before writing any bars we tried five variants on 16 probe seeds that the
round did not reuse:

- a higher bar for "it wanders" (2 or 3 log n instead of log n);
- a cheaper jump in the random-walk fit;
- keeping a change if forcing a jump there helps the random-walk fit enough;
- fitting both sides of the newest change separately;
- **deciding whether the level wanders on the days *before* the newest
  change**.

The first two kept the falls by making the gate open less everywhere, so most
of the cut on drifting sites went too. The third saved almost no falls. The
last two kept every fall. Reading the days before the change cut a little more
on drifting sites, so it became the candidate. It also asks the more sensible
question: did the level wander where nobody claims a change?

## The round

The [pre-registration](../../ventures/changepoint-detector/eval/middle-wander-calm.prereg.md)
kept the last round's five bars and added a fallback. If the new gate failed
only the "half of Middle's alerts on wander" bar but still cut at least a third,
it would replace the old gate as the opt-in. Seeds were fresh:

| | Middle | old gate | new gate |
|---|---|---|---|
| calm sites (cv 15%), mean days unaware per fall | 17.84 | 18.36 | **17.84** |
| noisier sites (cv 30%) | 30.90 | 31.36 | 30.91 |
| 2%-a-day wander, alerts per 1,000 days | 12.50 | 3.96 | **5.42** |
| 1% + 2% wander, total alerts | 75 | 30 | 40 |
| flat and step cells, steps found of 360 | 338 | 338 | 338 |

On calm sites the new gate is exactly Middle: every fall heard on the same day.
On a level that wanders 2% a day it still removes more than half of Middle's
alerts. It gives back a third of the old gate's cut, though, and at 40 against
37.5 it misses the "half" bar. So the fallback rule applied. `--wander gated`
now means the new gate, and the count Middle stays as it was. On a 1% walk,
which is close to the noise, it removes almost nothing.

These are simulated sites, and the next test is a real Search Console
property. The numbers, the probe tables and the commands are in the
[README](../../ventures/changepoint-detector/README.md) under "A calmer wander
gate".
