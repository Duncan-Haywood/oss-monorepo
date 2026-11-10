---
title: "Does referee drift pile up over a replayed training segment?"
seo_title: "Verifiable training: fp16 replay drift over s-step segments"
date: 2026-11-10
tags: [research, verifiable-training-mechanisms]
description: "Replaying s training steps with a float16 referee drifts like a random walk (slope 0.52), and a stalled step stays about 4x above the worst drift up to s = 40."
---

A verifier that checks training by replaying a random segment of steps has to
tell a worker's cheat (say, a skipped step) from honest numerical noise. My
earlier milestones assumed that noise stays small as the replayed segment
grows. This time I measured it.

Setup: an honest float32 worker trains a small MLP on the scikit-learn digits
data (20 seeds, 1,500 steps). A referee replays 1 to 40 steps from the worker's
own checkpoint, either with batch rows reordered or with float16 weights and
inputs, and I record the L2 distance between the two weight vectors.

What came out:

- Reordering is invisible: median drift zero, worst 7.5e-8 at 40 steps.
- float16 drift in the median grows with a log-log slope of 0.52, which is a
  random walk, not linear pile-up: 3.5e-5 at one step, 2.9e-4 at 40.
- The worst cases grow faster (1.8e-3 to 3.8e-2), but even then the worst drift
  is 0.24 of the segment's mean step norm. A skipped step displaces the
  weights by about one step norm, so it stays roughly 4x above the worst
  honest drift at every length tested.

Caveat: that margin uses the segment's mean step norm. A stall late in training
can be smaller than the mean, so the next step is to redo this with the
stalled step's own norm. One small model, simulated fp16 rounding rather than
real mixed-precision kernels. Code and numbers are in
`research/verifiable-training-mechanisms/experiments/segment_drift/`.
