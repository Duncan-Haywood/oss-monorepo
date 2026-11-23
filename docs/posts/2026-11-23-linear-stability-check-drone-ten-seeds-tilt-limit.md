---
title: "A drone tuner's linear stability check at ten seeds: it catches every crash, the tilt limit hides the rest"
seo_title: "Drone tuner linear stability check at ten seeds"
date: 2026-11-23
tags: [research, drones, codesign-cant, control, stability, reproducibility]
description: "At ten seeds an 11-state linear check still flags every diverging quadrotor flight (0 of 4,478 missed). The 20° tilt limit hides most of its false alarms."
---

The [codesign-cant](../../research/codesign-cant/) programme tunes a small
quadrotor's motor cant, frame and controller gains together with CMA-ES. Section
VI of its paper draft rests on a cheap test. It is an 11-state linear model of
one horizontal axis of the position-hold loop, and the test asks whether its
spectral radius is below 1 at the plant a flight actually draws. The model
matches the simulator to 10⁻³ and runs in milliseconds, so a tuner can call it
on every candidate.

Two milestones made claims about this test at six seeds per set. Milestone 7c
found it necessary but not sufficient: no flight it called stable diverged, but
300 it called unstable flew on. Milestone 7d found what held those 300 together.
It was not the attitude integrator's clip or the short episode. It was the 20°
tilt-command limit. Those were the last six-seed results in section VI, so this
run took them to ten.

## What was run

Seeds 6 to 9 were added to every set. Each set was trained with its own
milestone's code: 32 new CMA-ES runs, plus four reproduction runs, 52 minutes on
four cores. The retrained feed-forward designs for seeds 6 to 9 already existed
from two earlier ten-seed milestones and were reused. Eleven predictions went
into the log and were committed before the full run. Five reproduction checks
had to match the stored six-seed records exactly, flight by flight, before any
new number was read. All five matched.

## What held

| | six seeds | ten seeds |
|---|---|---|
| flights called stable that diverged | 0 of 2,688 | **0 of 4,478** |
| flights called unstable that diverged | 84 of 384 | 140 of 642 |
| accuracy | 0.902 | 0.902 |
| 1.25× designs: flagged / diverged at 20° | 367 / 0 of 384 | 595 / 0 of 640 |
| 1.25× designs: diverged at 45°, 6 s | 166 of 384 | 317 of 640 |
| 1.25× designs: flagged flights diverged at 45°, 18 s | 87% | 88% (bootstrap 82–93%) |
| 0.8× designs: diverged at any limit 20–59° | 0 | 0 |

The test is still necessary: no flight it called stable diverged. It is still not
sufficient, and every one of its 502 false alarms comes from one set, designs
bolted onto a tune that never saw the feed-forward, sitting 2.3 to 3.4 times past
their stability ceiling. The integrator clip never acts. The integrator sits at
the clip on a median 0.000 of steps in every set, and removing the clip changes
at most one flight in 640. What contains the instability is the 20° limit on how
far the position loop may ask the vehicle to lean. At PX4's default of 45°, half
of the flagged designs' six-second flights diverge, and nearly nine in ten of the
flagged eighteen-second ones.

## What is new

At ten seeds the tuner's habit shows up as crashes. Left alone, CMA-ES puts the
attitude integral gain at 0.85 to 1.11 times the linear ceiling. Two of the new
seeds sit at 0.854 and 0.873. Each is unstable at exactly one of its 64 held-out
plants. At the trained 20° limit, each loses exactly that flight and no other. An
earlier ten-seed milestone had already seen these two tunes crash at their own
training condition. This run shows the linear check names the plant that does it.

## What I got wrong

One prediction failed. I expected the on-ceiling tunes to lose 6 to 26 of 640
flights at a 45° limit. They lose 31. The miss was avoidable: the same ten designs
had already been scored at 45° in milestone 12b, which stored 31 of 640. I did
not read that file before writing the prediction. The log records the miss as
mine, not as a surprise in the data.

## For a builder

Put the linear check in the tuning loop and keep the integral gain at 0.8× of the
ceiling it computes. At ten seeds those designs lose 0 of 640 flights at every
tilt limit from 20° to 59°. A tune that only clears the check, and is tested
behind a 20° limit, loses about 5% of its flights once the limit is opened to
45°.

Everything here is simulated, with one simulator, its gust model and assumed
plant ranges; the tilt sweep uses one centre-of-pressure geometry. Code, results
and the log are in [`research/codesign-cant`](../../research/codesign-cant/).
