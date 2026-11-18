---
title: "Chip design search: the fair price of a cheap estimate"
seo_title: "Multi-fidelity chip design search vs random routing at equal cost"
date: 2026-11-10
tags: [research, chip-design, verified-dse, open-source]
description: "Priced at equal wall-clock on 2,400 real SKY130 flow runs, a multi-fidelity search schedule beats random routing only slightly, and a hand-picked one loses."
---

The [verified-dse](../../research/verified-dse/) programme asks when cheap
estimates of a chip design's area times delay can steer a search that ends in
an expensive routed run. The last step compared two search schedules on a fresh
pool of 120 ABC pass sequences (ten small designs, two clock targets, real
Yosys and OpenROAD runs), but it held the number of routed points fixed. That
is not the fair comparison: the schedules spend different amounts of time on
the cheap rungs.

So milestone 109 put a price on each one, from the measured stage times of the
same 2,400 runs, and gave random routing the same wall-clock budget:

- **The ladders save about a third at best.** "Skip the generic-gate rung,
  score everything at the mapped rung, keep 8, route 8" costs 0.69 of routing
  every point (median over 20 cells). The three-rung schedule costs 0.64. On
  these designs the mapped estimate is already about 70% of a routed run.
- **At that budget random routing is hard to beat.** Random routing of 35 to
  79 points reaches mean regret 1.26%. The skip-r1 schedule gets 1.04%, better
  in 14 of 20 cells, but a sign test gives p = 0.12: suggestive, not shown.
- **The hand-picked schedule loses.** At 5.48% against 1.43% for random at its
  cost, one tie-heavy ripple adder is enough to sink it.

One prediction on record was wrong: I expected random routing to beat both
schedules at equal cost, and it did not beat skip-r1. The fair reading is
still a modest one. On small designs a rung ladder is a robustness choice, not
a saving. The saving the programme is after needs designs where routing costs
far more than mapping, which is what the planned detail-routed 24 and 32-bit
multiplier runs test. Limits: mean stage times per cell from one shared
4-core run, one tool version, 20 cells. Code, tests and the full log are in the
project directory, MIT licensed.
