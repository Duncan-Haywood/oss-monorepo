---
title: "A float16 replay audit cannot catch a worker who trains in float16, and here that costs nothing"
seo_title: "Low-precision forgery against float16 replay training audits"
date: 2026-11-17
tags: [research, verifiable-training, ml-systems, numerics, security]
description: "A worker who computes training steps in float16 or bfloat16 passes a float16 replay audit almost every time. On a small MLP the cheaper run loses nothing."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how cheaply someone who pays for a training run can check that
the worker really did the work. The worker commits its weights and optimiser
moments every 20 steps. A cheap referee replays sampled segments in float16 and
flags any segment whose committed end is too far from its own replay. A float32
arbiter then replays each flagged segment and convicts it or clears it.

[Yesterday's step](2026-11-16-verifiable-training-sub-batch-forger.md) found
that computing some steps' gradients on part of the batch saves under 0.4% of
a segment's compute before the referee catches it. On real accelerators a
cheaper proxy is precision. A dense FP16 tensor-core step costs half a TF32
step and about a fifteenth of an FP32 vector step (the H100 SXM datasheet lists
989, 495 and 67 TFLOPS). The referee's tolerance is float16 noise. So what
happens when the worker computes its steps at float16 too?

## What the run measured

It reused milestone 86's 1,280 training runs: an MLP on scikit-learn's digits,
plain SGD, momentum and Adam at two learning rates, four learning-rate
schedules, and 40 calibration plus 40 test seeds. In each of 3,000 test
segments per setting, the forger computed the last q = 1, 2, 5, 10 or 20 of the
segment's 20 steps two ways. One rounded weights and inputs to float16, which
is exactly the referee's recipe. The other rounded them to bfloat16, which
keeps 8 significand bits to float16's 11. The run also trained whole runs both
ways, to see whether the cheap run is actually worse. All nine predictions were
written in the [log](../../research/verifiable-training-mechanisms/LOG.md)
before anything ran.

## What it found

- **The referee is blind to float16.** A float16 forger is caught in at most
  1.7% of segments at any q. At q = 20 it commits the referee's own replay, bit
  for bit, so the referee measures a discrepancy of exactly zero.
- **It is nearly blind to bfloat16 too.** A whole bfloat16 segment is caught in
  17% to 35% of segments under momentum and Adam, and in 5% to 12% under plain
  SGD. The referee flags a segment only above the largest honest value it has
  seen. Under momentum and Adam that maximum is tens of times the typical honest
  value, so a bfloat16 segment's error sits well inside it.
- **Flagging "too good to be true" helps a little.** A second rule flags
  segments whose discrepancy falls below the smallest honest value. With it the
  referee catches a whole float16 segment in 95% to 100% of momentum and Adam
  settings, but not one forged with only 10 of its 20 steps at float16. That
  still leaves a quarter of a segment's compute (at the TF32 ratio) for free.
  The rule also sends 1% to 4.2% of honest segments to the arbiter, against my
  predicted ceiling of 3%. The arbiter convicted none of them.
- **The cheat does no measurable harm here.** Whole float16 runs end within
  0.38% of the honest held-out loss, and bfloat16 runs within 0.74%. The
  low-precision run ends worse on about half the seeds, as chance would have it.

After reading the outcome I added one diagnostic, labelled as post hoc in the
log. The float32 arbiter separates precision cheats well on its own. Honest
replays differ from the worker by about 1e-5 of a step, and a single float16
step lifts that tenfold or more. Its threshold was split by segment block (ten
times the largest honest value in each five-segment block) and applied to every
segment. That way it convicts a single float16 step in 78% to 100% of segments
and wrongly convicts at most 2 of 3,000 honest ones. Each arbiter step costs
about 15 times a referee step, though.

## What it means

A float16 replay checks whether the steps were taken, not what precision they
were taken at. Whether that is a hole depends on what the requester pays for.
If the contract pays for a model as good as an honest run's, a low-precision
run on this MLP delivers that. If it pays for FP32 work as such, for
reproducibility or numerical guarantees, the audit has to run at the
arbiter's precision and cost. The numbers are in
[`results.txt`](../../research/verifiable-training-mechanisms/experiments/precision_forgery/results.txt).

Four of my nine predictions failed. The worst miss was bfloat16, which I
expected the referee to catch nine times in ten at five forged steps. It
caught it once in thirty to once in three.

## Limits

The test uses one small MLP on digits, where precision barely matters. Numpy on
one CPU plays every party, and precision is simulated by rounding operands with
float32 accumulation. The compute savings are datasheet ratios, not
measurements. The forger cheats only at the end of a segment. Next is the same
test on the programme's small transformer, where bfloat16 training is known to
lose quality, to see whether the referee's blind spot starts to cost something.
