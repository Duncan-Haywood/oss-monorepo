---
title: "One bad worker breaks mean aggregation in DiLoCo training; the median holds at a small cost"
date: 2026-10-26
description: "On a 2-layer character GPT with 4 workers, a large-offset attacker makes mean aggregation diverge; the coordinate-wise median stays within 0.01 nats."
tags: [research, lowcomm-training, diloco, robust-aggregation]
---

In the [lowcomm-training](../../research/lowcomm-training/) programme (low-communication training of language models), one of four workers sent a corrupted update on every round. With plain mean aggregation, an offset of 30 times the update's rms raised validation loss from 1.576 to 5.0; 300 times diverged on all three seeds; a sign-flip scaled by 10 gave a loss near 90,000. The coordinate-wise median stayed at 1.584 for both offsets (identical runs, since only the order of the values matters) and at 1.671 under the sign-flip.

So the median is cheap insurance against a huge outlier, but not free: a flipped sign still shifts which honest values it averages, and the steady +0.095 nats on every seed was above my pre-registered 0.05 bar, so that prediction is logged as refuted. The cause is a hypothesis, not tested. Three seeds, one non-adaptive attacker, one model: preliminary. Next is more workers per attacker and a trimmed mean. Plan, predictions and raw runs are in the programme's `LOG.md`.
