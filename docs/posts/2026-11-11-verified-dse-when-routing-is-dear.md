---
title: "Chip design search: the cheap-estimate ladder pays only when routing is dear"
seo_title: "Multi-fidelity chip design search on 26 held-out designs"
date: 2026-11-11
tags: [research, chip-design, verified-dse, open-source]
description: "On 26 chip designs it was never tuned on, a skip-the-cheap-rung search schedule beats random routing only where routing costs over 3x a mapped estimate."
---

The [verified-dse](../../research/verified-dse/) programme asks when a cheap
estimate of a chip design's area-times-delay can safely steer a search that
ends in an expensive routed run (Yosys, ABC and OpenROAD on SKY130). Yesterday's
step ended with an awkward finding: on ten small designs, where a routed run
costs only about 1.5 times a mapped estimate, the best schedule barely beat
spending the same time on random routing.

Today's step replays the same schedule, unchanged, on 26 designs it was never
chosen on: 52 cells of real flow runs already in the project's cached tables,
including 16 to 40-bit multipliers where a routed point costs up to 22 times a
mapped score. The predictions were committed before the replay ran.

- **Where routing is dear, the ladder pays.** In the 23 cells where a routed
  point costs more than 3 times a mapped score, "score everything at the mapped
  rung, keep 8, route 8" costs about a quarter of routing everything and beats
  random routing of the same wall-clock in 18 cells (mean regret 2.07% against
  3.59%).
- **Where routing is cheap, random routing is safer.** In the other 29 cells,
  random routing of about half the pool reaches 1.29% against 6.21%, because
  a few designs have mapped scores that point the wrong way (one broadcast-mix
  design at 49.9%, a 64-bit barrel shifter at 26 to 29%).
- **Most cells and the mean disagree.** Over all 52 cells the schedule wins 37
  and loses 13 (sign test p = 0.001) but has the higher mean regret, 4.38%
  against 2.31%. A typical user gains; an unlucky one loses badly.

The 3x split was fixed in advance, but the two split means were computed after
the first run, and the tables span several tool versions. The practical rule
this points to, and the next step: measure the routed-to-mapped cost ratio
before searching, and only trust the ladder when routing is several times
dearer. Code, tests and the full log are in the project directory, MIT
licensed.
