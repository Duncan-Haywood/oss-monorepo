---
title: "A camera calibration update rule, tuned on one camera and tested on another"
seo_title: "Is a self-calibration update rule overfit? Leave-one-out on TUM"
date: 2026-11-21
tags: [research, sensing-selfcal, camera-calibration, cross-validation]
description: "Chosen leave-one-sequence-out on TUM video, the half-sd update rule for a held focal length is picked every time; its per-recording margin is thin."
---

The last step of the `sensing-selfcal` programme
([update a camera calibration unless the pool agrees](2026-11-21-update-a-camera-calibration-unless-the-pool-agrees.md))
found a simple rule for when a robot should replace the focal length it holds
with a pooled self-calibration estimate: replace it unless the two agree
within half a standard deviation of the pool. With five pooled 1.2 s windows,
that rule's worst-case regret was 0.42 points, against 1.17 for always
replacing and 3.33 for a symmetric 2-sd change test.

That step picked the rule from eight candidates, scored on the same 31 blocks
of windows. A rule chosen that way can look better than it is, so this step
checked it out of sample.

## What was run

This is leave-one-sequence-out on the three TUM RGB-D recordings the
programme uses (fr1/desk and fr1/xyz from a Kinect, fr3/structure-texture
from an Xtion). For each recording held out, the rule with the smallest
worst-case regret is picked on the other two and scored on the held-out one.
The fold that holds out fr3 tunes the rule on the Kinect alone and scores it
on the other camera. Nothing was re-solved: this re-uses the saved window
solves. Six predictions were written into the log before the code existed.

## What it found

- **The choice is stable.** At five windows (with the causal k<sub>1</sub>
  prior) all three folds pick the half-sd rule.
- **It transfers across cameras.** Tuned on the Kinect, it scores 0.55 points
  of worst-case regret on the Xtion, against 1.38 for always replacing and
  4.61 for the 2-sd test.
- **The margin per recording is thin.** On fr1/desk it ties always-replace
  (1.32 against 1.32), and on fr1/xyz it loses by 0.07. On fr1/desk the 2-sd
  test actually does better (1.09), because that recording's pools sit close
  to the board calibration and refusing them costs nothing. That prediction
  failed.
- **The firm result is the negative one.** Across all 36 combinations of
  model, window count and reference calibration, the rule chosen out of
  sample beats the symmetric 2-sd change test in every one. It beats always
  replacing in 32.

Four of the six predictions held. One caveat on reading the numbers: the
pooled out-of-sample regret at five windows (0.42) equals the in-sample figure
by construction, because every fold chose the same rule. The evidence against
overfitting is that the choice was stable, not that number.

## What it does not show

There are three folds, two of them from the same camera, and only 8 to 14
overlapping blocks in each held-out recording. Against the TUM and
target-free reference calibrations, the folds do not agree on a rule. So
"replace unless within half an sd" is a recommendation tied to a stated
reference, not a universal rule. Staleness is still simulated: the held value
is shifted, and the lens does not really change.

Code: [`experiments/m3x_loso/analyse.py`](../../research/sensing-selfcal/experiments/m3x_loso/analyse.py);
log: [`LOG.md`](../../research/sensing-selfcal/LOG.md);
project page: [sensing-selfcal](../../research/sensing-selfcal/README.md).
