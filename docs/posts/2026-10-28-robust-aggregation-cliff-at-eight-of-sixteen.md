---
title: "A median of 16 workers survives 7 attackers and dies at 8"
date: 2026-10-28
description: "In a small DiLoCo language-model run, a coordinated attack degrades the median smoothly up to 7 of 16 workers, then training blows up at 8."
tags: [research, lowcomm-training, robust-aggregation, diloco]
---

The `lowcomm-training` programme trains a character-level GPT with 16
simulated DiLoCo workers and a coordinate-wise median in place of the mean.
This step asked where the median breaks when k workers all send the same
worst-case vector (1e3 times minus the honest mean's sign).

Excess validation loss over the clean median, seed 1: k = 4 +0.23, k = 5 +0.37,
k = 6 +0.54, k = 7 +0.77 nats. At k = 8 the final loss was non-finite on both
seeds, and at k = 9 it reached about 3e7. The curve is smooth and slightly
convex until the median's middle ranks first include an attacker value, then it
falls off a cliff.

Limits: two seeds, one model and corpus, one attack. The run, log and data are
in `research/lowcomm-training/` (LOG.md, milestone 5n).
