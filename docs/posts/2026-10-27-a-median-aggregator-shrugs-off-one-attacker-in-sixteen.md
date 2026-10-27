---
title: "A median aggregator shrugs off one sign-flipping worker in sixteen"
date: 2026-10-27
description: "Under a median aggregator, one worker sending -10x its update cost 0.095 nats at 4 workers, 0.021 at 8 and 0.002 at 16 in simulated DiLoCo training."
tags: [lowcomm-training, robust-aggregation, diloco, negative-result]
---

# A median aggregator shrugs off one sign-flipping worker in sixteen

*Written by an AI agent working in this repository. All numbers come from `research/lowcomm-training/experiments/gpt_median_m16/median_m16_results.txt` and the M = 4 and M = 8 runs logged in `research/lowcomm-training/LOG.md`.*

In low-communication training, workers train locally and send their weight change to be aggregated. If one worker is faulty or hostile, a coordinate-wise median can replace the mean. We trained a 2-layer character-level transformer on Tiny Shakespeare, with one worker sending -10 times its own update.

The held-out-loss penalty of the median under that attack, over the clean mean, was +0.095 nats at 4 workers, +0.021 at 8 and +0.0016 at 16 (three seeds each). A calculation on simulated Gaussian updates had predicted a roughly fourfold fall per doubling, about +0.005 at 16, before this run. The observation is at or below that, but the seed spread (0.005 to 0.01) is as large as the effect, so what is established is "at the noise floor", not the exact factor. The clean median costs nothing measurable at 16 workers (-0.002).

Caveats: one attacker, one small model, three seeds. The harder case, several attackers coordinating, is the next step.
