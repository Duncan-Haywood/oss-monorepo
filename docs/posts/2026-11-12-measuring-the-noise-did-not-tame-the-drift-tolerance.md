---
title: "Measuring the rounding noise did not tame the drift tolerance"
seo_title: "Normalising fp16 replay drift by a noise probe: a negative result"
date: 2026-11-12
tags: [research, verifiable-training, machine-learning, open-source]
description: "Dividing fp16 replay drift by a measured gradient-noise probe gives no more stable a tolerance than the step norm: the honest tail lives between seeds."
---

A referee that replays 20-step segments of an outsourced training run on fp16
hardware has to accept some drift, and the
[verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme has been looking for a tolerance that is both stable and tight.
Milestones 76 and 77 found that the largest honest drift-to-step-norm ratio
sits late in training, where the cosine learning rate is nearly zero, and
that this makes a max-of-honest threshold grow with the calibration sample.

**The idea tested.** The fp16 error enters through the gradient at rounded
weights. So instead of dividing drift by the step norm, divide it by a noise
scale the referee measures itself: the learning rate times the gap between an
fp16 and a float32 gradient at the segment start, one extra float32 gradient
per segment (5% of the replay). If the tail came from the schedule, this
statistic should be flat across training and its maximum stable.

**What happened** (40 honest calibration seeds, 20 test seeds, same small MLP
on the digits data, 1,500 steps, 75 segments). The prediction failed. The
probe-normalised maximum moved 1.67x between two 20-seed halves, against 2.14x
for the step-norm rule and 1.68x for dividing by the learning rate, and its
largest honest value sat in the *first* segment. Fitted on all 40 seeds it
caught a 2% shrink of every step at five opened segments in 8% of jobs, no
better than milestone 77's two-zone rule (9%).

The reason showed up in a diagnostic after the run, so it is an explanation,
not a prediction: honest drift is heavy-tailed between seeds at the *same*
step. At a fixed segment position the standard deviation of the log ratio is
about 0.9 for every normalisation, and the maximum is 66 to 81 times the
median. No smooth scale divides that away.

**What survives.** With 40 seeds, milestone 77's two-zone rule (one maximum
for segments above 10% of the peak learning rate, another for the tail) has a
main-zone threshold that moved only 1.04x between halves, false-flags 0.1% of
honest segments, and catches a 10% shrink of 300 mid-training steps in 69% of
jobs where the other rules catch at most 11%. A uniform 2% shrink still
mostly hides, at a held-out loss cost of +0.0008; the next step is to ask
whether catching it is worth the replay budget at all.

Code, data and the full table:
[`experiments/noise_probe_tolerance/`](../../research/verifiable-training-mechanisms/experiments/noise_probe_tolerance/).
One MLP, plain SGD, a rounding model of fp16 rather than real kernels.
