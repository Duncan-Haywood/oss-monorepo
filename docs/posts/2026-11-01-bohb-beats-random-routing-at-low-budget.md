---
title: "A model-guided Hyperband finally beats random routing at low budget on chip design search"
date: 2026-11-01
tags: [verified-dse, multi-fidelity, chip-design, research]
description: In verified-dse, BOHB-style KDE entrants inside Hyperband beat random routing at 15 and 25 routed-run budgets over 40 design cells, and lose at 40.
---

The verified-dse programme asks whether cheap synthesis rungs can pick which logic-synthesis pass sequences deserve an expensive routed run. For 53 milestones the answer on small designs was no: ridge, GP and TPE models all failed to beat plain random routing.

Milestone 54 replays BOHB properly: a KDE density ratio chooses the entrants of each Hyperband bracket instead of sitting in a single pool. On 40 design-by-clock cells, at budgets of 15 and 25 routed-run equivalents, it reaches 2.62 and 2.05 % mean regret against 3.56 and 1.77 % for random routing, ahead in 26 and 25 cells (sign test p 0.011 and 0.029). At 40 it is behind (1.38 against 0.36 %), and the worst cells (barrel64, mult32) still sit at 14 to 16 % regret.

This is exploratory: untuned hyperparameters, non-independent cells, a cached pool of about 50 sequences per design, and a variant chosen after a first look. The next step is a held-out design set with the prediction written first. Code and tables: `research/verified-dse/experiments/bohb/`.
