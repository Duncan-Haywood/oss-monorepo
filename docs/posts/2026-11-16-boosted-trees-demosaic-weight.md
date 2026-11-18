---
title: "Boosted trees beat our linear demosaic weight on ten unseen raws, and broke one camera"
seo_title: "Gradient-boosted demosaic weight: held-out test on 10 raw files"
date: 2026-11-16
description: "A LightGBM weight for our Bayer demosaic passed both pre-registered bars on unseen raws, yet left a Pentax K-1 II worse than no model at all."
tags: [photo-editing, raw, demosaic, machine-learning, research]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, builds the green at each red or blue pixel of a Bayer raw from neighbouring greens plus a fraction of the pixel's own detail. Earlier today a 45-number linear model learned to pick that fraction per pixel. It beat our fixed default on ten raw files it never saw. A follow-up note then measured the limit for any model whose choice is constant on 4 x 4 pixel tiles. That limit came out at about +0.83 dB of green error, against +0.385 for the linear model. So we asked whether a gradient-boosted model could close part of that gap.

## The test, written down first

Before running anything, we committed the plan: the 29 features, the LightGBM settings (400 rounds, 63 leaves, no tuning), the folds, and two bars. To reach the test frames, the trees had to beat the linear model by 0.02 dB in five-fold cross-validation and on 60% of training copies. On the ten test frames they then had to beat the shipped model by 0.02 dB and on 18 of 30 copies (each frame clean and at two noise levels). That commit is in the PR history, ahead of the results.

## What happened

| | boosted trees | linear |
|---|---|---|
| cross-validation, 120 copies | +0.527 dB | +0.386 dB |
| copies where the trees win | 108 of 120 | |
| ten test frames, 30 copies | +0.451 dB | +0.406 dB (shipped) |
| test copies where the trees win | 22 of 30 | |

Both bars passed. The trees close about 31% of the gap between the linear model and the 4 x 4 limit. Half of what they learn comes from the 5 x 5 neighbourhood statistics, which a per-pixel linear model can't see.

## Why it isn't shipped

On one camera, the Pentax K-1 Mark II, the trees do worse than the fixed default at every noise level (-0.21 to -0.29 dB), while the linear model gains +0.25 there. The Sony A7 III also loses to the linear model. A mean that goes up while one camera goes down is not good enough for a raw developer, because nobody shoots "the mean camera". The K-1 II has no optical low-pass filter, which might explain it. That is a guess we haven't tested.

The gain on unseen frames was also a third of the cross-validation margin. That is a reminder to judge on held-out frames, not on cross-validation.

## Next

A guarded version that falls back to the linear weight on frames unlike the training set, pre-registered with a per-frame floor. Then tree inference in plain numpy and C, so the developer doesn't depend on LightGBM. The full numbers, every row and the command to reproduce them are in `ventures/photo-editing/eval/bayer-boosted-weight-2026-11-16.md`.
