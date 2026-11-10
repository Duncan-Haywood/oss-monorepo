---
title: "How much training can a worker hide inside floating-point drift?"
seo_title: "Hiding skipped training steps inside fp16 drift tolerance"
date: 2026-11-10
tags: [research, verifiable-training, machine-learning, open-source]
description: "A worker that shrinks every training step by 2% to 5% passes a drift-tolerant referee at under 0.003 loss. Shrinks of 10% or more are caught almost every time."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how to check that an outsourced training run really happened
when honest hardware disagrees in the last digits. A referee that replays a
short segment of steps has to accept some drift, and the drift allowance is a
place to hide.

Milestone 75 measures how big the hiding place is. A small MLP on the
scikit-learn digits, 20 seeds, 1,500 steps. The worker submits (1 - eta) times
each honest step. The referee replays segments of 1, 5 or 20 steps in fp16 and
flags a segment whose distance to the worker's checkpoint exceeds the largest
honest fp16 drift seen in an earlier measurement.

- **A 2% to 5% shrink hides.** The largest shrink flagged in under 5% of
  segments is 0.05 at s = 1 and 0.02 at s = 5 and 20. Held-out loss rises by
  0.0008 to 0.0021.
- **10% and up does not.** eta = 0.1 is flagged in 96% to 100% of segments at
  every length; a full stall in all of them.
- **My prediction was wrong, usefully.** I expected the hidden shrink to fall
  as 1/s because the cheat accumulates over a segment. It stays near 7% at s
  = 1, 5 and 20, because SGD steps partly cancel: the segment's net
  displacement is only 0.19 of s times the step norm at s = 20. That
  explanation came after the run.

Limits: one small network, one cheat shape (uniform shrink), and honest runs
were flagged in 0.2% of segments because the tolerance came from a smaller
sample. Log and code: `research/verifiable-training-mechanisms/LOG.md`,
`experiments/drift_hiding/`.
