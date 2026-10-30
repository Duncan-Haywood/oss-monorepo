---
title: "Can a quantile bound the regret of cheap-to-expensive chip search?"
date: 2026-10-30
tags: [verified-dse, research, successive-halving, chip-design]
description: "A 90th-percentile bound on halving regret holds in 38 of 40 cached chip-flow cells; the two failures show why a pilot cannot certify it."
---

The [verified-dse](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/verified-dse) programme asks when a cheap synthesis score can safely prune candidates before the expensive routed run. Earlier steps proved a regret bound for successive halving, but it is a worst case over every candidate and needs the full table, so no 16-point pilot can check it. A fixed multiplier on the pilot's estimate did not fix that (milestone 40).

Milestone 41 tried the extreme-value route: use the 90th percentile of each candidate's excess instead of the maximum. On the cached 1,200-run table (40 design/clock/start cells, 200 tie-breaks each), the bound sits under the spread of routed scores in 38 cells, against 32 for the worst-case bound. Realised regret exceeded it in exactly 5.00% of draws, a figure I had predicted would be above 5%. That prediction was narrowly wrong.

The failures are not spread out. They are two whole cells (tight adder at R2, relaxed MAC at R1) that fail on every tie-break: the pool optimum there is one of the few candidates with a large excess, so a quantile over all candidates misses it. A pilot samples random candidates; the argmin is not one. So this is evidence, not a certificate, and the missing piece is a pilot-side bound anchored to the optimum.

Everything runs from cached tables in about 3 seconds: `experiments/theory/quantile_g.py`.
