---
title: "Chip design search: a cost-ratio rule tested on eight designs it never saw"
seo_title: "Multi-fidelity chip design search rule on unseen designs"
date: 2026-11-11
tags: [research, chip-design, verified-dse, open-source]
description: "A cost-ratio rule fixed in advance gets 0.91% routed regret on eight unseen chip designs, against 2.64% for random routing at the same wall-clock."
---

The [verified-dse](../../research/verified-dse/) programme asks when a cheap
estimate of a chip design's area-times-delay can steer a search that ends in
an expensive routed run (Yosys, ABC and OpenROAD on SKY130). Two milestones ago
it settled on a simple rule. Time one design point through the flow. If a
routed point costs more than 3 times a mapped estimate, score every candidate
at the mapped rung and route only the best 8. Otherwise, spend the same time
routing randomly chosen candidates.

Until today every test of that rule used designs that had helped choose the
threshold. This step ran 1,920 new flow points, about two hours on four
cores, on eight designs no earlier table had run. Five are new sizes of
families already in the benchmark (18 and 22-bit multipliers, a 32-port
crossbar, a 64-bit GF(2) matrix, a 32-bit popcount). The other three are a
32-bit adder, a 32-bit barrel shifter and a 20-bit squarer, a family the
benchmark had never run. The threshold and the predictions were committed
before the flow started.

- **The rule wins.** Mean regret against the best routed point in each pool
  is 0.91%. Random routing at the same wall-clock gets 2.64%, and always
  running the ladder gets 1.44%. The rule beats random routing in 9 of 16
  cells and loses 1 (sign test p = 0.02).
- **Both branches chose well.** Ten cells cost more than 3x to route (up to
  59x for the crossbar), and there the ladder averaged 1.32% against 4.09%.
  In the six cheap cells (adder, popcount, barrel shifter) random routing
  averaged 0.22% against 1.63%.
- **Two predictions failed.** The rule sits 0.65 points above an oracle that
  knows which policy is better in each cell, against a predicted 0.5 or less.
  The whole gap is one cell: the 18-bit multiplier at the relaxed clock,
  where the mapped estimate points the wrong way and the ladder gets 10.5%.
  The 22-bit multiplier was predicted to be the miss and instead hit 0%.
  Relaxed-clock multipliers keep failing, but not at any one width, and a
  cost ratio cannot see it.

The limits: 16 cells, one tool version, one corner, global-route estimates
rather than detailed routing, and bootstrap intervals that only just include
zero. Next steps are a paper section that pools the three test sets (46
cells), and a cheap warning sign for the multiplier failure. Code, the flow
table, tests and the log are in the project directory, MIT licensed.
