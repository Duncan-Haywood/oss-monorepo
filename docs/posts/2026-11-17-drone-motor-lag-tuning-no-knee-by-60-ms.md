---
title: "Tuning a drone for a 60 ms motor still cut crashes at 33 ms: no knee yet, but the vehicle gets heavier"
seo_title: "Drone motor-lag tuning: no knee by 60 ms, mass pays"
date: 2026-11-17
tags: [research, robotics, drones, quadrotor, control, sim-to-real]
description: "Simulated 5-inch quadrotors tuned for 52 and 60 ms motor lag crashed less at every lag than 45 ms tunes. The cost is 4-8% more mass and a softer loop."
---

This is the fourth post today on one question in our [rotor-cant co-design programme](../../research/codesign-cant/README.md). If you know a quadrotor's motor lag only as a range, what lag should you tune it for? Two published identifications put 5-inch quadrotor motors at 33 ms and 39.1 ms. Tuning at the [slow end](2026-11-17-tune-drone-at-slow-end-of-motor-lag.md) beat the midpoint. [Randomising across the range](2026-11-17-randomising-drone-motor-lag-made-tuning-worse.md) was worse. And tuning for a [45 ms motor](2026-11-17-tune-drone-for-slower-motor-than-measured.md), slower than anything measured, was better still, even when the drone flew with the fast 33 ms motor.

So where does slower stop paying? We tuned at 52 ms and at 60 ms to find out.

## The experiment

The lever-aware objective was retuned at the two new floors. That is the objective that has beaten the plain one in five milestones running, and using one objective let us test two floors for the compute of one earlier milestone. Neither 52 nor 60 ms is a measured motor. They are tuning choices, 33% and 53% slower than the slower identification. As before, the training plants multiply the lag by a random factor of 1 to 2.

One thing was new. Last time two 45 ms designs ended up right on the edge of the stability certificate at 33 ms, because training never checked them there. So this time the certificate was also required at 33 ms: the search could only accept designs that are certified at the fastest measured lag. CMA-ES ran over 6 seeds, 2 starts and 2 frame geometries, 3,200 evaluations per run, about 2.6 hours on four cores. Seven predictions went into the [log](../../research/codesign-cant/LOG.md) before the full run. The main one said 60 ms would finally cost something at the slower identification.

## What happened

It didn't. The test is the same hard condition as before: twice the trained centre-of-pressure lever, a 45° tilt limit and 384 held-out flights per set. Diverged flights, summed over both frame geometries:

| Lag the designs fly | Tuned at 39.1 ms | 45 ms | 52 ms | 60 ms |
|---|---|---|---|---|
| 33 ms | 83 | 61 | 46 | 20 |
| 36 ms | 120 | 77 | 55 | 27 |
| 39.1 ms | 145 | 98 | 61 | 40 |
| Identified range, total of 2304 | 348 | 236 | 162 | 87 |

Each slower floor cut crashes by another third to a half, at every lag in the identified range. The ordering holds in 13 of 14 lag-by-geometry cells. The one exception is the old 15 ms law, where almost nothing crashes (10 against 8). Unlike the earlier steps, this gap is not just a lean. Against the 45 ms designs, the 60 ms designs have per-cell Mann-Whitney p values of 0.004 to 0.014 in all six identified cells (post hoc, six seeds). The 52 ms designs are not separated from the 45 ms ones.

The certificate held as well. All 24 new designs are certified across 33-39.1 ms. And the new 33 ms check turned out not to be the reason. On 22 of 24 designs the stability radius came out the same whether we checked only the slow corners or only the 33 ms ones: the mode that limits them does not move with the lag. So the gain comes from the floor, not from the extra constraint.

## What it costs

The price shows up in the vehicle. The 60 ms designs are 4-8% heavier than the 45 ms ones, with slightly larger propellers. Their position gain is about 20% lower, and they track about 5% worse on the easy condition (one lever, 36 ms). The 52 ms designs carry no mass penalty and track about 3% worse. The tuner is buying robustness the way earlier milestones saw it do: mass and a gentler position loop.

Four of seven predictions held. The three that failed all expected slower tuning to start costing crashes, or to make the search reject more candidates.

## What it means, and what it doesn't

In this simulator the crash count never tells you where to stop: a slower tune keeps buying robustness out to 60 ms. Where to stop is a question of what you are willing to give up, in mass, endurance and tracking. That is a requirement a builder states, not a stability limit. The practical rule becomes: tune for a motor slower than your slowest measurement, keep the stability certificate checked at your fastest measurement, and pick the floor from your mass and tracking budget.

The caveats matter more than usual here. Our stress test (twice the trained lever, a 45° tilt limit) rewards a slow, heavy vehicle by construction. Apart from the small tracking number, nothing in it charges for a softer position loop. The floor and the training ceiling still move together, so a 60 ms floor also trains on plants up to 120 ms. All of this is one simulator, a first-order motor lag and two identifications from one lab. Next we separate the floor from the ceiling, add a test that charges for sluggish tracking, and put a flight-time requirement on the 75 ms bracket.

Code, results and the full log are in [`research/codesign-cant`](../../research/codesign-cant/README.md) (simulated; MIT licensed).
