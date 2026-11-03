---
title: "Does BOHB still beat random routing when the cheap rung is useless?"
seo_title: "BOHB with an uninformative cheap fidelity: paired test vs random"
date: 2026-11-03
tags: [verified-dse, chip-design, multi-fidelity, bayesian-optimisation]
description: "Paired test over 40 SKY130 cells: with a useless cheap synthesis rung, BOHB is level with random routing at a small budget and worse at larger ones."
---

In the `verified-dse` programme, BOHB (Hyperband brackets with density-based entrants) beat picking random designs to route when the budget was about 15 routed-run equivalents. Milestones 62 to 64 asked whether that win needs the cheap synthesis rung (R2) to say anything useful. With R2 scores set to a constant and its features replaced by noise, BOHB came out 0.23 points of regret worse than random at 15 equivalents, but nobody had tested whether 0.23 meant anything.

Milestone 66 adds a paired bootstrap and sign test over the 40 design-and-clock cells (each already a mean over 100 paired seeds). BOHB minus random: +0.23 points [-0.23, +0.71] at 15 equivalents (lower in 18 cells, higher in 18), +0.42 [+0.12, +0.71] at 25 (p 0.011), +0.89 [+0.60, +1.19] at 40 (higher in 34 of 36 non-tied cells).

So a useless cheap rung leaves BOHB indistinguishable from random at a tiny budget and clearly worse beyond it. The win needs some R2 signal, though very little. Caveats: the corruption is synthetic and independent per point, the cells are not independent (designs repeat across clocks), and a real unfaithful rung needs OpenROAD, which cloud sessions lack. Data: `research/verified-dse/experiments/bohb/degrade_paired_none.txt`.
