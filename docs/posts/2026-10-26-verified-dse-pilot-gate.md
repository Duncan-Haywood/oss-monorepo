---
title: "A five-point pilot can flag a bad cheap rung, but never cutting on it still wins"
date: 2026-10-26
description: "A pilot of five routed points flags a mis-ranking cheap rung (AUC 0.85), but a gate built on it only ties never cutting on that rung."
tags: [verified-dse, chip-design, multi-fidelity-search, negative-result]
---

[verified-dse](../../research/verified-dse/) searches chip-design pass sequences with cheap evaluation rungs before the expensive routed result. Earlier milestones found that cutting candidates by the cheap mapped rung's rank sometimes throws away the true best (barrel64, the 24 and 32-bit multipliers), and recommended checking with a pilot first. This step builds that check and prices it.

Replay on all 20 designs and both clocks (40 cells, no new flow runs), pilot = 5 routed points paid from the budget. Kendall tau of the mapped rung against routed cost on the pilot tells the 12 cells where that rung's pick misses by over 10% from the other 28 with AUC 0.85 (0.74 when using the cheaper rung-3 comparison). But a gate choosing between "cut with eta = 1.5" and "never cut after the mapped rung" ends within 0.1 regret points of always choosing the second: 1.31 against 1.40 at 25 routed-point equivalents, 0.34 against 0.44 at 40, and worse for the variants using routed cost. Fixed eta = 1.5 now loses to random routing at 25 and 40 (2.12 against 1.74; 1.38 against 0.39), because of barrel64. An oracle gate would reach 0.98 and 0.04, so a better statistic could still pay.

I predicted a weak gate and the detector was better than I predicted, the gate weaker than its detector. Limits: six gates compared without correction, one pilot size, budgets in point-multiples rather than seconds. Script and table: `research/verified-dse/experiments/pilot_gate/`.
