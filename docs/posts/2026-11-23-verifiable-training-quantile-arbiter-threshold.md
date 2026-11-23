---
title: "Auditing outsourced training: set the threshold from a quantile, not the worst honest value"
seo_title: "Quantile thresholds close blind zones in training audits"
date: 2026-11-23
tags: [research, verifiable-training, ml-systems, statistics, security]
description: "A training audit with thresholds at 10x the worst honest value missed whole zones. Ten times the 0.95 quantile closes them under momentum and Adam."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how cheaply someone who pays for a training run can check that
the worker really did the work. The worker commits its weights and optimiser
moments every 20 steps. An auditor replays a segment in float32 and convicts
the worker if the committed state lands too far from the replay.

[The last step](2026-11-23-verifiable-training-sample-float32-replays.md)
found that this float32 replay, run on a random sample of segments, is the
best use of an audit budget. It convicted a worker who computes even one step
of a segment in float16 in 93% to 100% of segments under momentum and Adam.
But the misses were not spread out. They were whole stretches of training. In
one setting, every segment in the first five was missed in every seed.

## Why whole zones go blind

The threshold for each stretch of five segments (a "zone") was ten times the
largest honest discrepancy seen there in 40 calibration runs. A maximum is the
least stable number you can take from a sample. In each blind zone, one or a
few honest segments were 6 to 3,669 times larger than the zone's 95th
percentile. In a typical zone that ratio is about 1.1 to 1.7. So one unusual
honest run set the threshold for its whole zone, high enough that a forgery
passed under it.

That matters more than the averages suggest. The thresholds have to be
written into the audit contract, so a worker can read them. A forger who
knows where the blind zones are cheats only there, and then it is never
caught, at any sampling rate.

## What we tested

Before running anything, we wrote down 60 threshold rules: multiples of the
zone's maximum, of its 99th, 95th or 50th percentile, and a robust log-scale
rule, each calibrated on 40 or 80 honest runs. We also fixed how one would be
chosen. A rule counts only if it convicts at most 3 of 3,000 honest segments
in every setting. Among those, the winner is the rule whose worst zone
convicts most often. We chose the rule on the seeds where the blind zones had
been found, then tested it on 40 new seeds that no choice had touched. That
came to 2,560 training runs, covering four optimisers and four learning-rate
schedules on a small network trained on handwritten digits.

## What we found

The winner was ten times the zone's 95th percentile, calibrated on 80 runs.
On the new seeds, it convicted one forged float16 step in **every segment of
every zone** in all 12 momentum and Adam settings. The old rule's worst zones
there scored 0 and 0.095. Honest workers were convicted in 13 of 48,000
segments, against 9 for the old rule. Forgeries of two or more steps were
caught in at least 97% of segments everywhere. All eight predictions held.

Plain SGD is not fixed. Its last zone, where the learning rate is smallest
and one float16 step moves the weights least, is still caught in only 22% to
36% of segments. The next step is a threshold scaled to the step size there.
The limits stand as before: one small network, precision simulated on a CPU,
and false-conviction rates measured from a handful of events.

The figure, code and full results are in
[`experiments/arbiter_threshold/`](../../research/verifiable-training-mechanisms/experiments/arbiter_threshold/),
and the plan written before the run is in the programme's
[research log](../../research/verifiable-training-mechanisms/LOG.md).
