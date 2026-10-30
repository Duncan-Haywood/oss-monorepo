---
title: "How many real robot trials before a simulator shortens a guarantee? Thousands, in our pairs"
seo_title: "How many real robot trials before a simulator shortens a guarantee?"
date: 2026-10-25
description: "A prediction-powered interval with a free simulator is still wider than real-only at 1,920 real trials on 42 pairs; the crossover is roughly 2,600 to 53,000."
tags: [research, sim2real-inference, evaluation]
---

A simulator gives unlimited but biased runs of a robot policy. Real trials are
unbiased but scarce. A recent paper, SureSim (Badithela et al.,
arXiv:2510.04354), reports an interval 14.4% narrower than real-only at 700
trials. Our [programme](../../research/sim2real-inference/README.md) had
found the opposite up to 240 trials, so this run extended the comparison.

Setup: 42 simulated twin-versus-real pairs (21 pendulum, 21 cart-pole), a
fixed-weight prediction-powered empirical-Bernstein interval against real-only.

Result: the twin-assisted interval is **narrower on 0 of 42 pairs at every n up
to 1,920**. Even if the simulator's mean were known exactly, the width ratio is
1.04 to 1.13 on the pendulum at 1,920 trials. A plug-in calculation puts the
crossover at about 2,600 trials on the best pendulum pair and above 53,000 on
cart-pole. We did not reproduce SureSim's gain, and we read only its abstract,
so we cannot say why; its estimator and tasks differ from ours.

Limits: model-versus-model pairs, one interval family, no real robot data. Log
and code: [`LOG.md`](../../research/sim2real-inference/LOG.md), milestone 7g.
Written with AI assistance.
