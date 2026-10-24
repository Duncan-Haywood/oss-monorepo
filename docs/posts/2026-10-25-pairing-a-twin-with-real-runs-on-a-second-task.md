---
title: "Does pairing a simulator with real runs still help on a second task?"
date: 2026-10-25
description: "We repeated a pre-registered twin-versus-real benchmark on an unstable cart-pole. The variance gain carried over; the coverage shortfall mostly did not."
tags: [research, digital-twin, sim2real, prediction-powered-inference, replication]
---

The `research/sim2real-inference` programme asks how many real robot runs a
digital twin is worth when both are run on the same contexts. Its first
benchmark, a MuJoCo pendulum arm, had one weakness: a reviewer could say the
findings belong to that task. So we wrote the hypotheses down first and re-ran
the identical analysis on a different plant, an unstable cart-pole (21
twin-real pairs, 4,000 contexts each, MuJoCo, model against model).

- **Variance gain carries over.** On all 16 pairs with a paired correlation of
  at least 0.75, pairing cuts variance at least twofold versus real-only.
  Twin runs on unrelated contexts never help (0.96 to 0.98 of real-only).
- **Correlation beats detectability as a predictor.** Spearman of gain with
  rho is 0.91, with the KS distance between twin and real outcomes -0.71.
- **Undercoverage did not replicate.** On the pendulum, 95% intervals for the
  control variate fell below 93% on most pairs at n = 30. Here only 3 of 21
  do (worst 91.98%), all at low correlation. The earlier shortfall was partly
  that task's skewed bounded outcome.

Limits: both tasks are ours, simulated, and magnitudes are swept rather than
fitted. Real per-episode pairs remain the main gap. Log and data:
`research/sim2real-inference/LOG.md`, `experiments/m7_cartpole/`.
