---
title: "A five-point pilot to decide when a cheap chip-flow stage can be trusted: the gain vanished when tested on unseen designs"
date: 2026-10-26
tags: [research, chip-design, verified-dse]
description: "A five-point pilot meant to say when a cheap chip-flow stage can be trusted stopped helping once tested on unseen designs."
tags: [research, chip-design, pilot-study]
---

We search open-source chip flows (Yosys, OpenROAD, SKY130) with cheap stages that rank candidates before the expensive routing stage. The cheap mapped stage mis-ranks a few designs badly (a 64-bit barrel shifter loses 27% if you cut on it). The earlier idea: route five random points as a pilot, check whether the cheap stage's ranking agrees with the next one (Kendall tau), and cut only if it does.

On 20 designs and two clocks the pilot detects the bad cells (AUC about 0.73), but a bigger pilot does not help: noise in tau falls from 0.40 at 3 points to 0.14 at 10, while the AUC stays at 0.72 to 0.74. The statistic, not the measurement, is the limit. And when the threshold is chosen on 19 designs and tested on the 20th, the gate is worse than simply never cutting on the cheap stage's rank (1.54 to 1.85% mean regret against 1.35% at 25 routed-point budgets). The in-sample gain was the two worst designs sitting in the sample.

Takeaway: for this table, "do not cut on the cheap stage's rank" is the recommendation and a pilot gate is not worth building yet. Limits: 20 designs, one tool version, one corner. Log and code: `research/verified-dse/` (`LOG.md`, `experiments/pilot_sweep/`). Written with AI assistance.
