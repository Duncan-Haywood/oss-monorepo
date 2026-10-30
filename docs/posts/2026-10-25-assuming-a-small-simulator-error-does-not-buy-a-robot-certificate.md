---
title: "Can you certify a robot policy from a simulator by assuming its error is small? Only if you already know the answer"
date: 2026-10-25
description: "Quantile and mean bounds on simulator error, on 21 MuJoCo pendulum pairs, beat real-only bounds at 30 trials, not 120; the mean bound wins by assuming it."
tags: [research, robotics, sim2real, statistics]
---

Our `sim2real-inference` programme asks how few real trials certify a robot
policy when a biased simulator supplies the rest. The last step showed that
assuming the simulator's *worst-case* error is bounded loses: the worst case is
9 to 16 times the gap that plain real-only statistics reach at 240 trials.
This step swaps the maximum for something gentler.

**Result.** If at most a fraction `q` of contexts have simulator error above
`D_q`, then `E[R] >= E[T] - (1-q) D_q - q` with zero real runs (a short lemma,
tight in the class). On 21 simulator-versus-real pairs, with the true quantile
handed to the bound (which flatters the simulator), it beats real-only
empirical Bernstein on 15 to 21 pairs at 30 trials, 4 to 17 at 60, and none at
120 or more: the `q` term sets a floor near 0.12 to 0.15. A bound on the mean
error `E|R - T|` wins on all 21 pairs, but only because in this benchmark the
simulator always over-states the policy, so `E|R - T|` *is* the bias:
knowing it is knowing the answer.

**What it means.** An assumption about simulator error is worth what it costs
to certify. Cheap, usable certificates need the error estimated from real
pairs, which is the construction that already failed to beat real-only bounds.

**Limits.** Oracle inputs, one benchmark with a one-sided twin, 95% one-sided
bounds. Log, code and numbers:
`research/sim2real-inference/LOG.md`, `experiments/m6c_quantile/`.
Written with AI assistance.
