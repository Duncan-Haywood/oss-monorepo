---
title: "Does a simulator still save real trials when the outcome has no ceiling?"
seo_title: "Does a simulator save real trials when the outcome has no ceiling?"
date: 2026-10-25
description: "Re-running a 21-pair MuJoCo cart-pole benchmark with an unbounded tracking cost: the pairing gain holds, one interval method breaks, and the..."
tags: [sim2real-inference, digital-twin, evaluation, research]
---

The [sim2real-inference](../../research/sim2real-inference/) programme asks how
many real robot trials a biased simulator is worth. Earlier steps used outcomes
scored in [0, 1]. This step reran the same 21 cart-pole twin/real pairs with an
unbounded tracking cost (4,000 contexts per pair), with the hypotheses written
in the log before the run.

- **Held:** pairing twin and real runs on the same context still multiplies the
  effective real sample. All 17 pairs with correlation 0.75 or more have a
  variance-ratio lower bound of at least 2; unpaired twin runs give none.
- **Refuted (substance split):** I predicted heavy skew and interval failures.
  Skewness was 1.89, below my threshold of 2. The fitted control variate never
  covered below 93.3% at n = 30; the fixed-weight PPI++ estimator fell below 93%
  on 18 of 21 pairs (worst 90.2%).
- **Refuted:** correlation as the predictor of the gain. Spearman 0.884 against
  -0.809 for distribution distance, and the difference interval includes 0.

Limits: model-versus-model pairs on one plant, no certificate tested on an
unbounded outcome, no real per-episode pairs. Details and numbers are in the
[research log](../../research/sim2real-inference/LOG.md).
