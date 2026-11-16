---
title: "28 wins or 13? Counting a chip-flow search rule's blind results by design, not by cell"
seo_title: "Counting blind chip-flow results by design, not by cell"
date: 2026-11-16
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 42 blind SKY130 cells the clipped ladder beats random routing 28 to 8 (p = 0.001). By design it is 13 to 5 (p = 0.096); about 95 designs would settle it."
---

The [verified-dse](../../research/verified-dse/) programme asks when a cheap
stage of an open chip flow (Yosys and ABC synthesis, before OpenROAD place and
route on SKY130) can be trusted to rank candidates. Its working rule, the
clipped ladder, maps every ABC pass sequence, ranks them by mapped area times a
clipped delay, and routes only the best 8. Ten milestones in a row tried to put
a guard in front of it that would spot the designs where it fails. None worked
on designs the guard had not seen.

Milestone 136 writes the evaluation the paper needs: every rule, scored only on
the cells that were out of sample for it, from the commit that fixed the rule.
It runs no new flow. It replays the 42 blind cells (21 designs, two clock
targets each) of three earlier flow runs, and its six predictions were
committed before the table existed.

## What the table says

| rule | blind cells | mean regret | ladder on the same cells | random on the same cells |
|---|---|---|---|---|
| clipped ladder (SWC) | 42 | 3.30% | 3.30% | 4.65% |
| gate-depth guard SWG(32) | 42 | 4.26% | 3.30% | 4.65% |
| pilot-probe guard SWP(32) | 26 | 3.19% | 3.14% | 4.01% |
| gate flag + pilot probe SWGP(32) | 26 | 2.85% | 3.14% | 4.01% |
| fresh-only fall-back SWPF(32) | 14 | 3.23% | 2.70% | 5.57% |

Regret is how far the best routed point a rule finds is above the best of the
whole pool, at the same compute budget as routing 8 ladder points. After a Holm
correction no guard differs from the ladder (smallest adjusted p 0.23). One guard
does come out lower on its own blind cells, the gate flag in front of the pilot
probe, but it is worse than the ladder on 14 of those 26 cells and better on 6.
Its gain comes from routing three failing designs randomly. Its interval runs
from -2.40 to +1.64 points.

## Cells or designs

Against equal-cost random routing, the ladder is better on 28 cells and worse
on 8. A sign test on that gives p = 0.001, and earlier write-ups quoted it. But
each design contributes two cells, a relaxed and a tight clock, and they move
together: the sign agrees on 16 of the 18 designs where the ladder runs at all.
Counted by design, the ladder is better on 13, worse on 5 and tied on 3, and
p = 0.096.

The loss is concentrated. One 4-bit product feeding a 128-bit shifter (pmul4)
costs the ladder 19 points against random. A guard that knew in advance which
cells fail would sit 1.99 points below the ladder, and all of that headroom is
on 8 cells from 5 designs. Dropping any single design still leaves the ladder
ahead of random (the gap runs from -2.38 to -0.85 points).

## What it takes to settle

The design-level difference averages -1.36 points with a standard deviation of
6.71. At that spread, a 95% interval below zero needs about 95 blind designs.
So far 21 have been run. The paper will therefore report the clipped ladder as
the best rule found, ahead of random on most blind designs, and not as a proven
improvement on random routing. The next useful step is a confirmatory set built
for power. Running one clock per design buys twice as many designs for the same
core-hours, because the second clock adds little new information.

Limits: replay only; every blind design is a wide shifter; one tool version
and corner; global-route estimates; the 95-design figure is a normal
approximation that assumes the spread holds.

Code and table: [`experiments/blind_pooled/`](../../research/verified-dse/experiments/blind_pooled/results.txt).
Research log: [`LOG.md`](../../research/verified-dse/LOG.md).
