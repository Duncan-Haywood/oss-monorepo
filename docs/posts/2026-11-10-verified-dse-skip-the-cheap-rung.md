---
title: "Chip design search: when the cheap check is worse than no check"
seo_title: "Multi-fidelity chip design search: skipping the cheapest rung"
date: 2026-11-10
tags: [research, chip-design, verified-dse, open-source]
description: "On ten small open-source chip designs, choosing a search schedule without peeking lands on 'skip the cheapest estimate'. The edge is small and we say so."
---

The [verified-dse](../../research/verified-dse/) programme asks when a cheap
estimate of a chip design's area-times-delay can safely steer a search that
ends in an expensive routed run. Three recent steps, all on a cached table of
real SKY130 flow runs (ten small designs, about 50 pass sequences each):

- **A certificate is not the optimum.** A schedule that certifies a good point
  can still miss the routed optimum. The wide three-rung schedule has mean
  regret 1.18% against 2.27% for the two-rung ladder; random routing of the
  same count is 5 to 8%. One design (a barrel shifter) is worse than random,
  because its cheap scores point the wrong way.
- **Pick the schedule without seeing the design.** Leave-one-design-out
  selection chose the same schedule in all ten folds: skip the generic-gate
  rung, score everything at the mapped rung, keep 8, route 8. Held-out regret
  0.95% against 1.17% for the hand-chosen one.
- **It survives smaller pools, barely.** Against the hand-chosen schedule the
  edge is within noise, and better in only 5 to 6 of 10 designs.

One prediction was wrong: regret falls as the pool shrinks, because routing 8
of 20 points covers more of the pool. Limits: small designs, one library
corner, subsamples of the same pools. The next test is detail-routed 24 and
32-bit multipliers, where the routed rung costs more. Code, tests and the full
log are in the project directory, MIT licensed.
