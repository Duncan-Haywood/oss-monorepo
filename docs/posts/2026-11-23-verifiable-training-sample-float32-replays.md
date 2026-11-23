---
title: "Auditing outsourced training: a random float32 replay beats a cheap float16 replay of everything"
seo_title: "Float32 sampling beats float16 replay for training audits"
date: 2026-11-23
tags: [research, verifiable-training, ml-systems, numerics, security]
description: "On fresh seeds, a float32 replay of random training segments catches float16 forgers that a float16 replay of every segment misses, at the same audit compute."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how cheaply someone who pays for a training run can check that
the worker did the work. The worker commits its weights and optimiser moments
every 20 steps. Until now the audit had two stages. A cheap referee replays
segments in float16 and flags any that land too far from its replay. A float32
arbiter then replays the flagged ones and convicts or clears them.

[The last step](2026-11-17-verifiable-training-low-precision-forger.md) found
a hole in that design. A worker who computes its last steps in float16, the
referee's own recipe, is almost never flagged. Looking back at the data, the
float32 arbiter on its own seemed to catch these forgers well. But that audit
was picked after seeing the results, on the same seeds. So this step wrote the
audit and nine predictions into the
[research log](../../research/verifiable-training-mechanisms/LOG.md) first, and
then ran it on 40 seeds nobody had looked at.

## What held up

- **The arbiter-only audit replicates.** With thresholds set per block of five
  segments, the float32 arbiter on every segment convicts one forged float16
  step in 93% to 100% of segments under momentum and Adam, and 78% to 91%
  under plain SGD. It convicted 1 of 48,000 honest segments.
- **The two-stage audit is still blind.** It catches five forged float16 steps
  in at most 15% of segments.

## The budget question

An audit costs compute, so the fair comparison is at equal cost. Take one
float32 replay of a segment as the unit. An fp16 replay then costs 0.5 of it
(FP16 against TF32 tensor cores) or 0.068 (against FP32 vector units). Both
ratios come from the H100 SXM datasheet. The two-stage audit costs that ratio
plus the share of honest segments it sends to the arbiter. For the same
compute, you can instead replay a random sample of segments in float32.

Against a forger who picks the cheapest disguise (five candidates, from
float16 steps to shaving one row off every batch), the random float32 sample
has the better worst case in **all 16** optimiser and schedule cells. At the
0.068 ratio it catches 6% to 10% of forged segments, against 0% to 8% for the
two-stage audit. At 0.5 it catches 42% to 53%, against 0% to 8%. The float16
referee wins against just one forger, the one who shaves rows. It catches 73%
to 100% of those segments, where the sample catches what its rate allows.

## What failed

Four of the nine predictions were wrong:

- More forged steps did not always mean more convictions. The arbiter missed
  whole blocks of five segments, every seed, wherever a single unusually large
  honest calibration value set the threshold.
- A float16 threshold at the 95th percentile of honest runs did catch whole
  bfloat16 segments, 91% to 98% of them. But on the fresh seeds it flagged up
  to 11.7% of honest segments, 2.3 times its nominal rate.
- Adding a random tenth of float32 replays to the two-stage audit did not beat
  spending the whole budget on float32 replays.

## The limits

This is one small MLP on a digits dataset, trained in numpy on one CPU.
Precision is simulated by rounding operands, and the costs are datasheet
ratios, not timings. The forger cheats only at the end of a segment and does
not react to the sampling rate. The code, results and every prediction, kept
or refuted, are in
[`experiments/arbiter_audit/`](../../research/verifiable-training-mechanisms/experiments/arbiter_audit/).
Next: fix the outlier-driven thresholds, try the same audit on a small
transformer, and time the replay costs on a real GPU.
