---
title: "Why a well-tuned drone still crashes when the gust lever doubles: ten seeds say 50% more thrust, not airmode"
seo_title: "Drone gust crashes at ten seeds: 50% more thrust, not airmode"
date: 2026-11-22
tags: [research, drones, codesign-cant, control, statistics, reproducibility]
description: "Ten seeds confirm that a margin-tuned quadrotor's crashes at a doubled gust lever come from running out of differential thrust. Airmode makes it slightly worse."
---

The [codesign-cant](../../research/codesign-cant/) programme co-designs a small
quadrotor's motor cant, frame and controller gains with CMA-ES, and is writing
the result up for *IEEE RA-L*. Section VI of the draft gives a builder a rule:
when you add a feed-forward that cancels the canted rotors' side force, keep the
attitude integral gain at 0.8× the ceiling an 11-state linear model computes.
An [earlier run](2026-11-22-ten-seeds-drone-integral-gain-margin-still-0-8x.md)
checked that rule at ten seeds, and it held.

The rule leaves one thing unfixed. If the frame's centre of pressure sits twice
as far from the centre of mass as the tuner assumed, a floor of crashes remains:
23 of 640 held-out flights at PX4's default 45° tilt limit, whatever the
margin. Milestone 7g had diagnosed that floor as a lack of torque authority,
using six seeds. This run repeated the diagnosis at ten seeds per set, with
every probe re-flown.

## How it was run

Six sets of tunes: four with the centre of pressure above the centre of mass
(no margin, and margins of 1.25, 1.43 and 1.67), two with it below. Seeds 6 to 9
of the above sets came from the earlier ten-seed run. Those of the below sets
were trained here with the original code: 16 CMA-ES runs, 36 minutes on four
cores in all. Nine predictions were committed to the
[log](../../research/codesign-cant/LOG.md) before the full run. Four
reproduction checks all matched exactly, the retrained seed-0 tunes to the
last digit among them.

Every tune flew the same 64 held-out flights at twice the trained lever, under
one probe at a time. The probes were a wider crash bound, halved position
gains, an airmode mixer (the collective may shift to make room for roll and
pitch), and an ideal mixer that delivers the request without the shared thrust
polytope, with and without extra torque room.

## What held

All 505 base crashes are tilt-overs past 60°; none is a slow drift. In the three
margin-trained sets at 45°:

| probe | crashed flights (of 1,920) |
|---|---|
| base | 69 |
| crash bound at 85° | 53 |
| airmode mixer | 75 |
| position gains ×0.5 | 24 |
| ideal mixer | 13 |
| ideal mixer, 1.25× torque | 0 |

The ideal mixer helps 29 of 30 tunes and hurts none (exact Wilcoxon p < 10⁻⁵).
In the flights that crash, the gust torque peaks at a median 0.87 of the motors'
torque limit, against 0.50 in the flights that survive. The vehicle runs out of
differential thrust.

## What moved

**25% more authority is the lower end.** At six seeds, 1.25× the torque room
removed every crash above and left 5 to 6 of 384 below. At ten seeds it still
leaves 8 to 9 of 640 in both below sets, and 3 of 640 for the unconstrained tune
above. With 1.5× torque, no set crashes at either tilt limit. A builder should
size the headroom at about 50%.

**Airmode is measurably worse, not merely useless.** At six seeds it was a raw
count. At ten it is a test: 6 tunes worse, none better, p = 0.03 at both
limits. At thrust-to-weight 2 the collective already sits mid-range, so
shifting it buys no roll or pitch room.

**One prediction failed.** I predicted that in every set the crashing flights'
median gust peak would be at least 0.80 of the limit. The tune with no margin
broke that at 45°: 0.59, with only 10% of its crashes seeing the gust above
the limit. Halving its position gains cuts its crashes from 83 to 18. That tune
crashes because its own aggressive loop asks for more torque than the polytope
gives, not because of the gust. That fits the earlier finding that unconstrained
tunes crash even at the lever they were trained at. The six-seed table had
shown the same 0.65, below the threshold I wrote, and I missed it when
writing the prediction.

## Limits

These are probes, not redesigns. The extra torque room scales the limits
without resizing motors, mass or power, and the ideal mixer cannot be built.
Each tune flies one held-out set of 64 simulated flights. The doubled lever is
outside training. Halving the position gains was flown only at the doubled
lever, so its cost in normal position hold is not measured.

Sources: [`stats.txt`](../../research/codesign-cant/experiments/m12f_ten_seeds_7g/stats.txt),
[`checks.txt`](../../research/codesign-cant/experiments/m12f_ten_seeds_7g/checks.txt),
the [figure](../../research/codesign-cant/experiments/m12f_ten_seeds_7g/m12f_authority.png),
and the [paper draft](../../research/codesign-cant/paper/DRAFT.md), section VI.
