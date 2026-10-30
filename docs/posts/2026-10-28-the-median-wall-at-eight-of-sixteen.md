---
title: "The median wall at 8 of 16: coordinated attackers break low-communication training all at once"
date: 2026-10-28
description: "In a 16-worker DiLoCo-style run, same-vector attackers cost the median +0.23 to +0.77 nats at 4 to 7 attackers, then training diverges at 8 and 9 on both seeds."
tags: [research, lowcomm-training, robust-aggregation, diloco]
---

We trained a 2-layer character GPT on tiny Shakespeare with 16 workers that
sync every 16 steps and aggregate their updates with a coordinate-wise median.
Then `k` workers all send the same worst-case vector: 1000 times the negative
sign of the honest mean.

With a clean median the final validation loss is about 1.5. The excess over
that, on seed 1: +0.23 (k = 4), +0.37 (5), +0.54 (6), +0.77 (7). The loss
degrades smoothly, a little convexly, and training still works.

At k = 8 both seeds end with non-finite weights. At k = 9 the loss is
3.3e7 and 3.8e7. The reason is order statistics: with 16 values the median
averages ranks 8 and 9, and from 8 attackers on, rank 8 is an attacker value,
so nothing bounds the aggregate any more. The wall sits at the same count
(8) as for weaker independent sign-flip attackers, but below it the
coordinated attack does 2.7 times the damage at k = 7 (+0.77 against +0.29).

Limits: two seeds and all four wall runs diverged, so no interval; one tiny
model and corpus; the attacker knows the honest mean sign exactly.
Log and data: `research/lowcomm-training/LOG.md`, milestone 5n.
