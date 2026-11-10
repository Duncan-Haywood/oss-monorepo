---
title: "A bigger honest sample made the training referee looser, not safer"
seo_title: "Calibrating fp16 drift tolerance for verifiable training"
date: 2026-11-10
tags: [research, verifiable-training, machine-learning, open-source]
description: "A drift tolerance set at the largest honest drift grew 2.9x with 40 seeds and let a 5% shrink of every step pass. A 99.9th-percentile rule catches a third."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how a buyer can check outsourced training when honest hardware
disagrees in the last digits. The referee replays short segments of the run in
fp16 and has to accept some drift. [Milestone 75](2026-11-10-verifiable-training-drift-hiding.md)
found that a worker can shrink every step by 2% to 5% inside that allowance.

Milestone 76 asked a follow-up question. A worker with a fixed shrink budget
can spread it thin or pack it into one window. Which hides better from a
verifier that samples segments at random? Along the way it also redid the
tolerance on a bigger honest sample, 40 fresh seeds and every segment, because
milestone 75's tolerance had flagged 0.2% of honest segments.

The setup: a small MLP on the scikit-learn digits, 1,500 steps, 20 test seeds.
The budget equals a 5% shrink of every step. It goes either everywhere, or into
a window of 750, 300 or 75 steps (the last is a full stall) placed early, mid
or late in training.

What came out:

- **The "largest honest drift" rule falls apart.** Over 40 seeds the largest
  honest drift ratio at 20-step segments is 0.655, 2.9 times the 0.227 that
  600 segments gave. A single segment of a single seed sets it, near the end
  of training, where the cosine learning rate is close to zero. The bulk of the
  distribution barely moved (99th percentile 0.128). So the more honest data
  you collect, the looser this referee gets. At that tolerance a 5% shrink is
  caught in 0.3% of jobs at a 100-step replay budget.
- **A percentile rule restores most of it.** At the 99.9th percentile honest
  jobs are almost never flagged (0.02% of segments at s = 5, none at s = 20),
  and the 5% shrink is caught in 26% to 34% of jobs. I chose this rule after
  seeing the tail, so treat it as a lead, not a tested result.
- **Spread or concentrate depends on segment length.** With 20-step segments a
  75-step stall early in training does twice the damage of the spread shrink
  and is caught less often (25% against 34%). With 5-step segments the same
  replay budget samples four times as many positions, and the stall is caught
  66% of the time. Milestone 74 picked 20-step segments because replay is
  cheaper there. Against a cheater who packs its budget into a window, the
  shorter segment buys detection. The spacing is a trade-off.
- **Late cheating is free here.** The same 75-step stall costs +0.0044
  held-out loss early, +0.0026 mid and nothing in the last 75 steps.

Every number above is small in absolute terms: at most +0.0044 held-out loss.
Limits: one network, seven hand-picked cheat shapes rather than an optimised
adversary, and 40 seeds still leave the far tail poorly measured. Next is a
tolerance that scales with the learning rate, since that is where the extreme
honest ratios sit. Code and full tables: `experiments/shrink_concentration/`
in the project, and its `LOG.md`.
