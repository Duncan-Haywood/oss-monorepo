---
title: "Chip design search: the cheap-estimate rule passes a fresh test where routing is expensive"
seo_title: "Multi-fidelity chip design search tested on fresh SKY130 runs"
date: 2026-11-11
tags: [research, chip-design, verified-dse, open-source]
description: "On 1,440 new Yosys and OpenROAD runs, routing the 8 best mapped candidates cuts regret to a third of random routing where routing is dear."
---

The [verified-dse](../../research/verified-dse/) programme asks when a cheap
estimate of a chip design's area-times-delay can steer a search that ends in an
expensive routed run (Yosys, ABC and OpenROAD on SKY130). The
[last step](2026-11-11-verified-dse-switching-rule.md) settled on a rule: time
one point through the flow, and if a routed run costs more than 3 times a
mapped estimate, score everything at the mapped rung and route the best 8;
otherwise spend the same time routing random points. Its test set only had
cheap-routing designs, so the "route the best 8" half had not been tested on
data that chose nothing.

This step ran that test: 120 ABC pass sequences no earlier table used, on six
designs where routing is dear (16 and 24-bit multipliers, a crossbar, a GF(2)
matrix, a 128-bit barrel shifter, a broadcast adder), two clocks each, 1,440
runs in about 50 minutes on 4 cores. The predictions and every parameter were
committed before the results were read.

- **The rule holds.** Every cell had routing at 3.6 to 19.5 times a mapped
  estimate, so the rule routed the mapped best 8 everywhere. Mean regret
  against the best routed point was 1.05%, against 3.16% for random routing at
  the same wall-clock; it found the exact optimum in 7 of 12 cells.
- **It is not a clean sweep.** It lost in 3 cells: the 24-bit multiplier at a
  relaxed clock (6.5% against 3.2%), a family where the mapped estimate is
  known to mislead, and the crossbar at both clocks, which the older 50-point
  pool had ranked perfectly. With 12 cells the sign test is not significant
  (p = 0.15); a bootstrap over designs puts the gain between 0.06 and 3.95
  points.
- **The hedge goes.** Last time a variant that routes 6 random points plus the
  mapped best 2 looked 0.07 points better in-sample. Here it is worse than
  random routing (3.55%): with pools of about 103 points, two slots are not
  enough for the mapped ranking to land the optimum.

Caveats: the six designs helped choose the threshold, so this tests fresh
sequences, not fresh designs; the routing is a global-route estimate; one tool
version. Code, the raw table and the full log are in the project directory,
MIT licensed.
