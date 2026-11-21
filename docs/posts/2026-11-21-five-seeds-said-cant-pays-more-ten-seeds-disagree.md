---
title: "Five seeds said quadrotor motor cant pays more under PX4-style mixing. Ten seeds disagree"
seo_title: "Quadrotor motor cant at ten seeds: a five-seed claim withdrawn"
date: 2026-11-21
tags: [research, drones, codesign-cant, statistics, reproducibility]
description: "Doubling the seeds kept the canted-quadrotor result (4.85° better, p = 0.002) but withdrew one claim: the shared thrust budget does not make cant pay more."
---

The [codesign-cant](../../research/codesign-cant/) programme asks what fixed
motor cant a small four-rotor X should have when its arm, propeller and
controller gains are tuned together. Its first two milestones ran five seeds
each. That is enough to see a big effect. It is not enough for a paper: with
five pairs, the smallest two-sided p a Wilcoxon signed-rank test can return is
0.0625. This run added seeds 5 to 9 to both milestones and changed nothing else:
205 more CMA-ES runs, 27 minutes on four cores. The predictions were committed
before the run, and three reproduction flights matched the stored numbers
to the last digit first.

## What held

The main result is firmer. With the corrected thrust allocation at a
thrust-to-weight ratio of 2, cant up to 35° beats no cant by **4.85°** of
held-out attitude RMS. The bootstrap 95% interval is 4.79 to 4.92°, every one
of ten seeds agrees, and the Wilcoxon p is 0.002, the smallest ten pairs can
give. All ten milestone-1 comparisons look the same, each within 0.12° of its
five-seed mean. Under a per-axis torque box cant wins 10 of 10 at every price
on hover power. With three optimiser starts and power priced at 1° per 100 W,
it wins 9 of 10 by 3.84° (p = 0.004).

## What did not

At five seeds the draft said that sharing one thrust budget across roll, pitch
and yaw, the way PX4 and Betaflight's attitude-priority mixers do, made cant
worth *more*: 6.08° of advantage against 4.81° under the torque box. At ten
seeds the two are 4.98° (interval 3.64 to 5.91°) and 4.86°. They are the same
within noise.

The difference comes from the uncanted vehicle. Seeds 0 to 4 all found a design
that saturates roll and pitch on 94 to 99% of steps and gives yaw nothing.
Three of the new seeds found a second optimum. It burns about 1700 W in hover,
almost never saturates, and is about 1.4° better. Five seeds had simply never
landed there. The claim is withdrawn from the paper draft. What survives is the
weaker statement: the shared polytope costs about 2.4° of accuracy, and cant
keeps its advantage on it.

One more failure turned up. Even with power free, one single-start run chose
9.5° of cant and lost to the uncanted design. The optimiser's habit of falling
to low cant is not only a power-price effect, so the three-start protocol stays.

## Why write this up

A five-seed result that held in all five pairs looked solid, and its headline
number still moved by 1.1°. The same check is now owed to the six-seed
position-hold sections. The [draft](../../research/codesign-cant/paper/DRAFT.md)
now quotes an interval and an exact p for every paired result in sections IV
and V. The statistics script is stdlib only:
[`m12_ten_seeds/stats.py`](../../research/codesign-cant/experiments/m12_ten_seeds/stats.py).
Everything here is simulated. Nothing has flown on hardware yet.
