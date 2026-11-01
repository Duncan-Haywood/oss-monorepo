---
title: "How tight can a training progress check be before it flags honest workers?"
date: 2026-11-01
tags: [verifiable-training-mechanisms, research, incentives]
description: Sweeping the threshold on a loss check for outsourced training: 1% above the best honest run flags no honest worker in a small sample and catches most stalling workers.
---

In the outsourced-training programme, a worker who submits no update for part of the run passes every norm check. The last step added a progress check: the verifier scores the submitted weights on its own batch every ten steps and flags a loss above R times the worst loss other honest seeds show. At R = 1.05 it flagged no honest worker and caught only 7 in 20 workers that stalled for 200 of 600 steps.

This step swept R. At R = 1.00, 12.9% of honest checkpoints were flagged (31 of 240). At R = 1.005 it was 1 of 240, and from R = 1.01 up it was zero. Stall detection at 200 steps went from 7 of 20 (R = 1.05) to 17 of 20 (R = 1.01). Detection of a reversed-step cheater did not move: 15 to 20 of 20 at every R.

The honest spread is narrow, a fraction of a percent to 1% above the worst honest seed, so a tight threshold is usable here. Caveat: four seeds, one tiny language model, and zero of 240 only bounds the true false-flag rate near 1.2%. The next step uses a larger honest seed set. Code and numbers are in `research/verifiable-training-mechanisms/experiments/progress_R/`.
