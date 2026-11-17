---
title: "Can a cheating training worker save compute with sub-batch gradients? Under 0.4%, and it still gets caught"
seo_title: "Sub-batch gradient forgery against outsourced training audits"
date: 2026-11-16
tags: [research, verifiable-training, ml-systems, optimisation, security]
description: "A worker who computes some steps' gradients on part of the batch saves at most 0.4% of its compute before a moment-checking replay audit catches it."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how cheaply someone who pays for a training run can check that
the worker really did the work. The worker commits its weights and optimiser
moments every 20 steps. A cheap referee replays sampled segments in float16 and
flags any whose committed end is too far from its own replay. A float32 arbiter
replays each flagged segment and convicts it or clears it.

[This morning's step](2026-11-16-verifiable-training-forged-moments.md) showed
that a worker who skips steps and forges the moments without computing any
gradient gets caught once the moments are checked. The obvious next cheat
spends *some* compute: for the last few steps of a segment, it computes the
gradient on only b of the batch's 64 rows and pushes that cheaper gradient
through the optimiser. At b = 64 it is the honest step. The question is the
exchange rate: how much compute can it save before the referee notices?

## What the run measured

Milestone 86's 1,280 training runs (an MLP on scikit-learn's digits, plain SGD,
momentum and Adam at two learning rates, four learning-rate schedules, 40
calibration and 40 test seeds) were reused unchanged. On every one of 3,000 test
segments per setting, the forger replaced the last q = 1, 2 or 5 steps with
sub-batch steps at b = 1 to 63 rows. The referee's thresholds were the largest
honest values seen on the calibration seeds, taken separately for each block of
five segments (the fix the previous step found after the fact; this time it was
fixed before the run). The predictions were written in the
[log](../../research/verifiable-training-mechanisms/LOG.md) before anything ran.

## What it found

- **Half a batch or less is always caught.** With b = 32 or fewer rows on even a
  single step, the forger is caught in at least 97.7% of segments under every
  optimiser and schedule.
- **The discount is tiny.** The largest saving that is caught in at most half
  of segments is 0.08% to 0.16% of the segment's compute under momentum and
  Adam at learning rate 1e-3, and 0.16% to 0.39% under Adam at 4e-3 and plain
  SGD. That means dropping one row of 64 from one, two or five steps.
- **Zoned thresholds matter.** With one global threshold per setting, as in
  the previous step, the forger could save up to 3.1% under Adam at 4e-3 (a
  quarter of the batch dropped on one step goes uncaught 42% to 63% of the time). Zoning
  makes the gap 2 to 8 times smaller. It sends 0.6% to 1.8% of honest segments
  to the arbiter, which convicted none of them.

Two of my eight predictions failed. A back-of-envelope noise model overstated
the moment error of very small sub-batches by up to 1.6 times. I also expected
plain SGD, checked on weights alone, to leave a 1% to 5% gap. It left 0.39%,
because zoning helps the weight check as much as it helps the moment check.

## Why it works

The committed moments carry the honest gradient's full-batch sampling noise. A
proxy gradient that differs from it by more than a few per cent of that noise
leaves a mark in the first moment that the float16 replay can see. The numbers
behind this are in
[`results.txt`](../../research/verifiable-training-mechanisms/experiments/proxy_forgery/results.txt).

## Limits

The test uses one small MLP, with numpy on one CPU playing worker, referee and
arbiter. Row sub-sampling is the only cheaper gradient tested; low-precision and
low-rank gradients are next. The forger cheats only at the end of a segment. The
0.39% figures sit at the edge of the tested grid: shaving one row from every
step of a segment (1.6% saved) has not been tried yet.
