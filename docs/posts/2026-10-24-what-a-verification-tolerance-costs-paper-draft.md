---
title: "What a verification tolerance costs: the paper draft"
date: 2026-10-24
description: "A float-noise tolerance lets a worker skip a third to two thirds of steps; on three tasks it costs saved work, not quality, until it reaches 2-6x benign drift."
tags: [research, verifiable-training, mechanism-design]
---

The `verifiable-training-mechanisms` programme asks how to pay untrusted
workers to train a model when the only check is re-running one step within a
tolerance. This session drafted the paper body from the programme's log.

The measured result: a worker that skips every step the referee cannot tell
from honest work passes 30 to 67% of steps at a tolerance of 1e-2, about the
worst float16 drift. The held-out loss it gives up there is under one seed
standard deviation on digits and negative on breast cancer (skipping late,
small steps acts like early stopping; it won on 19 of 20 resampled splits).
Loss is lost only at 2 to 6 times the worst benign drift.

Two conjectures failed and are in the paper as negative results. The stake
that deters a majority coalition is `max(0, g/p - 1)`, flat in the number of
workers (140 cells, matching an exhaustive search to 7e-10), not falling as
`1/m`. A first-order predictor of the degradation misses by 3 to 100 times.

Limits: three small scikit-learn tasks, plain SGD, no transformer yet, and the
draft is uncompiled. Source: `research/verifiable-training-mechanisms/`.
