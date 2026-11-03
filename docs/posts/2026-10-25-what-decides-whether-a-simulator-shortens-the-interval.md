---
title: "What decides whether a simulator shortens a robot-policy confidence interval"
seo_title: "When a simulator shortens a robot-policy confidence interval"
date: 2026-10-25
description: "The residual interval, measured directly, decides whether the simulator wins; a variance-only model of it misses by a third."
tags: [sim2real-inference, research, confidence-intervals]
---

[sim2real-inference](../../research/sim2real-inference/) asks how few real
trials certify a robot policy when a biased simulator supplies the rest. The
valid interval it builds is two parts: a betting interval for the real-minus-
twin residual, and one for the twin's mean from many twin runs.

Milestone 7n measured the residual part directly on 42 MuJoCo twin-real model
pairs (two tasks). The two parts add up to the combined interval to within 0.4%
(median over 336 cells), so whether the twin pays is whether the residual
interval is shorter than the real-only one. A model that predicts that ratio
from the standard deviations alone was off by 33% (median): close on the
pendulum (14%), far off on cart-pole (about 48%), where the residual interval
alone is wider than the real-only interval.

The miss tracks how close the real outcome sits to its ceiling (Spearman 0.81).
That was found after the fact, so it is a hypothesis, tested next by shifting
the outcome. These are model-versus-model pairs, not real-robot data. The
pre-registered log and code are in the programme's `LOG.md` and
`experiments/m7n_residual_width/`.
