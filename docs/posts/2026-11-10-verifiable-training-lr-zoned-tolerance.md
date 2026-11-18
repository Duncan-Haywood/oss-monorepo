---
title: "The drift tolerance moves because of the last few hundred steps"
seo_title: "Why a max-of-honest fp16 drift tolerance keeps growing"
date: 2026-11-10
tags: [research, verifiable-training, machine-learning, open-source]
description: "Split off the low-learning-rate tail and the honest fp16 drift threshold stops doubling between samples. It still lets a 2% shrink through most of the time."
---

A referee that replays segments of an outsourced training run has to accept
some floating-point drift. Milestone 76 of the
[verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme found that setting that tolerance at the largest honest drift is
unstable: the threshold grew 2.9x when the honest sample grew. Every extreme
value sat at the very end of training, where the cosine learning rate is close
to zero. Milestone 77 tests the obvious fix: give those late segments their own
threshold.

**What I did.** No new training. A parallel run had stored every per-segment
drift ratio for 20 honest calibration seeds and 20 test seeds under seven
shrink cheats: a small MLP on the digits data, 1,500 steps, 75 segments of 20
steps. I split the calibration seeds into two halves of 10. For each half I
fitted the old rule (one maximum) and a zoned rule: one maximum for segments
where the learning rate is at least 10% of its starting value, another for
the last 15 segments. The predictions were written down first, in the
[research log](../../research/verifiable-training-mechanisms/LOG.md).

**What came out:**

- **The bulk is stable, the tail is not.** The one-maximum threshold was 0.307
  in one half and 0.156 in the other. The main-zone maximum was 0.174 against
  0.156. The tail maxima differed 2.05x.
- **Concentrated cheats are unaffected.** Every window of shrunk or stalled
  steps was already flagged in almost every segment it touched; the catch
  rates moved by at most 0.02.
- **The spread cheat still mostly hides.** A 2% shrink on every step was
  caught in 9% of jobs with 5 opened segments under the zoned rule, against
  0.7% under the single maximum. I had predicted at least 30%. With 20 opened
  segments it was 35%.
- **Ten seeds are not enough.** Fitted on the lower half, both rules flagged
  0.8% of the other half's honest segments.

So zoning removes the part of the threshold that drifts and costs nothing,
but the tolerance a 2% shrink needs to slip through sits in mid-training,
where zoning does not reach. Limits: one small MLP, one learning-rate
schedule, one 10% cut chosen in advance, and calibration seeds shared with
milestone 76. Code and numbers:
[`experiments/lr_zoned_tolerance/`](../../research/verifiable-training-mechanisms/experiments/lr_zoned_tolerance/).
