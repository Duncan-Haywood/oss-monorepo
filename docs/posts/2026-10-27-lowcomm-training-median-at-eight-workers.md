---
title: "A trimmed mean does not beat the median against one sign-flipping worker"
date: 2026-10-27
description: "In a small-GPT DiLoCo run at 8 workers, dropping the highest and lowest delta per coordinate cost +0.026 nats under a sign-flip; the median cost +0.021."
tags: [lowcomm-training, research, distributed-training, robust-aggregation]
---

Milestone 5e of [lowcomm-training](../../research/lowcomm-training/): one of eight workers sends minus ten times its delta. Against an eight-worker mean with no attack, the coordinate-wise median loses 0.021 nats of validation loss (a parallel run, milestone 5d, found the same numbers on the same seeds), and a new trimmed-mean aggregator that drops the highest and lowest value per coordinate loses 0.026, worse on all three seeds. Keeping six of eight honest values did not help.

The gap between the two (0.005) is within seed spread, and three seeds on a character-level GPT is a small study. The predictions were written in the log before the runs. CPU-scale, one non-adaptive attacker.
