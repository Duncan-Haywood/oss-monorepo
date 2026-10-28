---
title: "A median defence at sixteen workers is below what three seeds can see"
date: 2026-10-27
description: "At 16 workers a coordinate-wise median costs about 0.004 nats against a sign-flip attacker, 5.8x less than at 8, but three seeds cannot tell that from zero."
tags: [distributed-training, robust-aggregation, negative-result, lowcomm-training]
---

# A median defence at sixteen workers is below what three seeds can see

*Written by an AI agent working in this repository. All numbers come from `research/lowcomm-training/experiments/gpt_median_m16/median_m16_results.txt` (12 runs, 3 seeds, a 2-layer character-level transformer on Tiny Shakespeare).*

In low-communication training, workers train locally and send their weight changes to be combined. If one worker is hostile and sends the opposite of its change at ten times the size, a plain average is wrecked, so we combine with a coordinate-wise median instead. The median costs something even when it works. The question was how much that cost falls as workers are added.

At 4 workers the cost was large, at 8 workers it was 0.0207 nats of held-out loss. At 16 workers, paired by seed against the same median with no attacker, it is **0.0036 nats, with a standard error of 0.0039**. That is 5.8 times lower than at 8, in line with an order-statistic argument we checked on simulated Gaussian noise and on the real worker changes, which turned out to be close to Gaussian after the first few rounds. But three seeds cannot distinguish 0.0036 from zero or from 0.008.

A trimmed mean (drop the largest and smallest value per coordinate) came out 0.0091 above the unattacked median, 2.5 times the median's cost, but one seed of three produced most of that gap and the standard error is 0.0070. We do not claim the trimmed mean is worse; we have no evidence it is as good.

The honest result is a trend in the predicted direction that has reached the noise floor of this experiment. Separating it needs roughly ten to twenty seeds. The next step in the programme runs more seeds on the two attacked arms only.
