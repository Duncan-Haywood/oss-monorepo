---
title: "A dispute costs one segment, not a re-run"
seo_title: "Settling a disputed training step with a float32 arbiter replay"
date: 2026-11-13
tags: [research, verifiable-training, machine-learning, open-source]
description: "A float32 replay of one flagged 20-step segment never convicted an honest worker and caught shrinks down to 3e-5 per step: checking training costs 8% of a job."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how cheaply a requester can check that an untrusted worker
really trained a model. In the protocol so far, the worker commits a weight
checkpoint every 20 steps. A referee on cheap fp16 hardware replays a few of
those segments and flags any that drift too far from the worker's
checkpoint. [Yesterday's step](2026-11-12-budget-the-false-disputes-not-the-maximum.md)
set the flag threshold at an honest quantile instead of the honest maximum. It
found the protocol worth running if settling a flag costs about one re-run of
the job, and not worth it at ten re-runs. Nobody had built the step that
settles a flag.

**The arbiter.** A flag only concerns one segment. So the arbiter replays only
that segment: 20 steps from the worker's committed checkpoint, on the same
batches, at the worker's own float32 precision. Its arithmetic order is its own
(batch rows shuffled, or the gradient split over four "devices"). A
float64 version was tested too. Its verdict compares its result with the
worker's committed end-of-segment weights. I wrote the rule and five
predictions into the log before running: convict above 10 times the largest
honest drift in calibration (40 honest training runs, 3,000 segments per
replay mode).

**What came out.** All five predictions held.

- Honest float32 replays disagree with the worker by at most 7.7 millionths of
  a step. The fp16 referee's 99% quantile is about 0.095 steps, so the two
  are 12,000 times apart. Float64 is tighter still (2.9e-7).
- No arbiter mode convicted any of 1,500 held-out honest segments.
- A worker that shrinks every step by 1e-4 is convicted on every segment. The
  arbiter's floor is a 3e-5 shrink (3e-6 with float64). At that floor the cheat
  costs the model 0.0000012 held-out loss, about 650 times less than the 2%
  shrink the referee was built to catch.
- With a float32 step costing 15 times an fp16 one, the H100's peak-rate
  ratio (67 against 989 dense TFLOPS on NVIDIA's spec page), the full
  protocol catches a 2% shrink in 79% of jobs for 8.1% of a job's compute.
  An honest worker reaches the arbiter in 6.8% of jobs and is always cleared.

**What changed in the picture.** The ten-re-run worry is gone: a dispute costs
one segment at the arbiter's rate, not a job. The weak point is now the fp16
referee. The two-stage protocol catches a 0.5% shrink in only 16% of jobs. One
segment replayed straight at float32, which costs 20% of a job at the H100
rates, catches every spread-out shrink of 1e-4 or more with certainty. A
cheat squeezed into the last 300 steps flips the comparison: five cheap fp16
segments catch it in 68% of jobs, one float32 segment in 20%. So the protocol
should run both kinds of check, and the next step prices that mix.

**Limits.** This is one small MLP on the digits data. CPU numpy stands in for
both machines, so shuffled reduction order is a proxy for real GPU
nondeterminism, which can be larger. The 15x cost factor is a datasheet peak
ratio, not a measurement. The cheats do not adapt to the checks. Code, data
and the full table:
[`experiments/dispute_arbiter/`](../../research/verifiable-training-mechanisms/experiments/dispute_arbiter/).
