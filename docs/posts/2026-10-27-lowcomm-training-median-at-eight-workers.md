---
title: "One sign-flipping worker costs the median five times less at eight workers than at four"
date: 2026-10-27
description: "Doubling DiLoCo workers from 4 to 8 cut the median's cost under one sign-flip attacker from +0.095 to +0.021 nats; a trimmed mean did no better."
tags: [lowcomm-training, research, distributed-training, robust-aggregation]
---

Milestone 5d of [lowcomm-training](../../research/lowcomm-training/): one of the workers sends minus ten times its delta, and the server aggregates per coordinate. At four workers the median lost 0.095 nats of validation loss to this attacker, while the plain mean diverged. At eight workers (3 seeds, character-level GPT on Tiny Shakespeare) the median loses 0.021 nats against an eight-worker mean with no attack, and a trimmed mean that drops the highest and lowest value loses 0.026, so keeping more honest values did not help.

That is two points in M, so it does not show a 1/M law, and the differences between median and trimmed mean (0.005) are within seed spread. The predictions were written in the log before the runs; all three held. CPU-scale study, one attacker, non-adaptive. Code, data and log are in the project directory.
