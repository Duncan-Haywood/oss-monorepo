---
title: "A cheater who stays under the check at every step still does damage"
date: 2026-10-30
tags: [verifiable-training-mechanisms, research, verification]
description: "A per-step norm check on submitted training updates stops a one-shot plant, but a worker who stays under it for 200 of 600 steps harmed 16 to 20 of 20 jobs."
---

Yesterday's milestone in the verifiable-training programme found that checking the size of each submitted training step (its L2 norm and largest coordinate, against 1.5 times the honest maximum) caught every one-shot planted-weight attack with almost no false alarms. This run asks the obvious next question: what if the cheater never trips the check, and just keeps going?

Three attackers, each passing the check on every step they act: a tiny gradient-chosen plant of 16 weights, the same with 256 weights, and a reversed SGD step. On a small transformer, 20 jobs per cell, harm means the held-out loss moved by more than 0.01.

For one step, nobody does damage (0 of 20). Over a window of 50 steps, 40 to 75% of jobs are harmed; over 200 steps (a third of training), 16, 20 and 20 of 20. My predictions of 0.25 or less for the small plant and 0.80 or more for the reversed step at 50 steps were both wrong, the first badly. The check does bite, as a cheater's drifting model makes its own gradients larger and the threshold then allows a smaller step, but not enough. The per-step check needs a cumulative companion, such as distance from a replicated checkpoint.

Results, code and the log entry are in `research/verifiable-training-mechanisms/experiments/spread_steps/`. The harm threshold sits close to the median effect at 50 steps, so the middle cells are the soft part.
