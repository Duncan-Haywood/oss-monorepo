---
title: "Budget the false disputes, don't chase the honest maximum"
seo_title: "A quantile drift tolerance for verifying outsourced fp16 training"
date: 2026-11-12
tags: [research, verifiable-training, machine-learning, open-source]
description: "Setting the replay-drift threshold at the honest 98% quantile catches a 2% training shrink in 79% of jobs for 13% of a job's compute, if a dispute costs one re-run."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme studies a referee that checks outsourced training by replaying a few
20-step segments on fp16 hardware. fp16 replay never matches the worker's
checkpoint exactly, so the referee has to accept some drift. Four steps in a
row tried to set that tolerance at the largest drift any honest run shows, and
every time the maximum moved with the sample. Honest drift is heavy-tailed
between seeds at the same step, so a maximum is mostly a record of how many
seeds you happened to run.

**The change.** Give up on never flagging an honest run. Pick a false-flag
budget f, set the threshold per zone (main training, and the near-zero
learning-rate tail) at the honest (1 − f) quantile, and pay for the disputes
that honest workers will sometimes trigger. This step reuses the last run's
data (40 honest calibration seeds, 20 test seeds, five cheats) and trains
nothing new. The predictions were written into the log before the analysis.

**What it buys.** A worker that quietly shrinks every step by 2% costs the
model +0.0008 held-out loss and slipped past every max-based rule: caught in 9%
of jobs when the referee opens 5 segments. At f = 1% it is caught in 44%, and
at f = 2% in 79%. The cost is honest jobs flagged 3.6% and 6.8% of the time.
A second gain I had not predicted: a 10% shrink hidden in the last 300 steps
had been the best-hidden cheat (4% caught). It turned out to hide behind a
single extreme honest segment in the tail zone. Under any quantile from
f = 0.25% it is caught in 68% of jobs.

**What it costs depends on the dispute.** The expected cost per honest job is
the replay plus the false disputes. If a dispute costs one full re-execution,
the 79% configuration costs 13% of a job's compute, and a 90% catch costs 26%.
If a dispute costs ten re-executions (several arbiters, or slow bit-exact
hardware), a 90% catch costs 1.43 jobs' worth, more than paying a second worker
to train the model again. So the drift check is no longer the expensive part.
The dispute is: it has to clear an honest worker, and its price decides whether
fine-grained detection is worth having.

**What did not hold.** In the main zone a quantile is no more stable between
two 20-seed halves than the maximum was (1.07x to 1.18x against 1.04x). The
instability lived in the tail zone, and a quantile fixes that (2.14x down to
about 1.05x). One of the five predictions failed outright, and another missed
in one cell.

Code, data and the full table:
[`experiments/quantile_budget/`](../../research/verifiable-training-mechanisms/experiments/quantile_budget/).
The limits: one MLP, plain SGD, a rounding model of fp16 rather than real
kernels, test seeds shared with earlier steps, a dispute cost that is swept
rather than measured, and a cheat that does not adapt to the published
threshold. The next step builds the dispute: a float32 or bit-exact arbiter,
with its own cost and error rates.
