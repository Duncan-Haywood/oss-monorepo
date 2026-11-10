---
title: "Should a cheating trainer hide in one burst or spread it thin?"
seo_title: "Concentrated vs uniform cheating against sampled training replay"
date: 2026-11-10
tags: [research, verifiable-training, machine-learning, open-source]
description: "Withheld training packed into a short window is caught by secret segment sampling. Spread as a 2% shrink on every step, it is almost never caught."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how a buyer can check an outsourced training run when honest
hardware disagrees in the last digits. The
[previous milestone](2026-11-10-verifiable-training-drift-hiding.md) found that
a worker can shrink every step by 2% and stay inside the fp16 drift a replay
referee has to tolerate. Milestone 76 asks whether the worker does better by
withholding the same amount of training in one burst.

**Setup.** A small MLP trained on the scikit-learn digits for 1,500 steps, 20
seeds. The worker withholds 30 step-equivalents of training: spread as a 2%
shrink on every step, or packed into a window of 300, 100 or 30 steps (the
last a full stall), early or late. The referee cuts the run into 75 segments of
20 steps and replays them in fp16. The tolerance is the largest honest drift
over 1,500 segments from 20 separate calibration seeds. A verifier opens k
segments, chosen at random and kept secret until after submission.

**What came out** (`experiments/concentrated_shrink/results.txt`):

| shape of the cheat | segments flagged | caught, k = 5 | caught, k = 20 |
|---|---|---|---|
| 2% shrink on every step | 0.1% | 0.007 | 0.03 |
| 10% shrink, 300-step window | 19% to 20% | 0.67 | 0.99 |
| 30% shrink, 100-step window | 6.7% | 0.30 | 0.80 |
| full stall, 30 steps | 2.7% | 0.13 | 0.47 |

- **Packing the cheat hands it to the verifier.** Inside a window almost every
  segment is flagged, so the catch is the chance of opening one of them. That
  chance grows with the window's length, and spreading the cheat across the
  whole run puts it under the tolerance.
- **The tolerance is the leak, not the sampling.** The 2% shrink costs +0.0008
  held-out loss and is flagged in 0.1% of segments. With more honest
  calibration data the tolerance went up, from 0.227 (600 segments) to 0.307
  (1,500), so a sample-maximum threshold keeps getting looser.
- **Late stalls cost nothing measurable.** The cosine schedule takes the
  learning rate to zero, so withholding the last 30 steps does not change
  held-out loss. Early windows cost +0.0016 to +0.0019.

My predictions were written down before the run, in the
[research log](../../research/verifiable-training-mechanisms/LOG.md). The
ordering and the window catch rates held. I expected the uniform shrink to be
caught about 10% of the time at k = 5; it was 0.7%, because the calibrated
tolerance came out wider than the one I had planned around.

**Limits.** One small MLP, plain SGD and the milestone 3 fp16 rounding model,
not real mixed-precision kernels. Windows were aligned to segment boundaries,
not optimised. The next step is a tolerance that does not widen as the honest
sample grows.
