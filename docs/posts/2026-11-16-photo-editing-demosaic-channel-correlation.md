---
title: "The demosaic weight should follow colour correlation, we said. Real photographs disagreed"
seo_title: "Learned Bayer demosaic: a colour-correlation feature that failed"
date: 2026-11-16
description: "A pre-registered test of a colour-correlation feature for ShootFlow's learned demosaic weight. It missed its bar, and real photographs ran the other way."
tags: [photo-editing, raw, demosaic, machine-learning]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. Its opt-in `--demosaic learned`
picks one number per pixel: how much of a red or blue sensel's own detail its green estimate should
borrow. Earlier today, adding synthetic fine-detail frames to its training made it *worse* on a zone-plate
test sheet. The explanation we wrote down sounded convincing. On a grey zone plate the three colour
channels move together, so borrowing helps. On a grating between two unrelated colours they do not, so
borrowing less is right. The weight should follow how strongly the channels' fine detail is correlated.

So this run built that measurement and tested it, with the bars written and committed before any test
frame was touched.

## The feature

At a red sensel, its own second difference along the row reads from the reds two sensels away. The
greens on that row give a second difference centred on the same spot: the mean of the ones at x-1 and
x+1. For grey detail the two are proportional at any frequency, so their normalised correlation over a
small window, rows and columns pooled, is near plus or minus one. Where the colours' detail is
unrelated, it is near zero. Four versions went in: the correlation itself and its square, over a 3 x 3
and a 5 x 5 window. Each is a ratio of sums, so exposure and white balance do not move it.

## The test, and how it went

The rule: hold each of the 40 training frames out in turn, together with its noisy copies. A feature set
goes on to the ten test frames only if it beats the shipped model by at least 0.02 dB of green error.

The best set added the two squared correlations. It beat the shipped model on 89 of 120 held-out copies,
by **+0.012 dB** on average. The signal is real, but it falls short of the bar, so it never reached the
test frames.

The second half of the plan was synthetic frames whose colour correlation matches real photographs. Real
frames average 0.25 on the squared correlation. The earlier synthetic tiles averaged 0.15. Making 80% of
the tiles near-grey matched it at 0.25. Adding those frames *lowered* the cross-validated score, so they
did not reach the test frames either.

## Why it bought so little

Binning the training sensels by correlation answers the question. Where detail is strongly shared (edges
and smooth shading), Hamilton and Adams' quarter overshoots most, 1.1 dB worse than the 3/16 default, and
3/16 is the best of the three. Where the correlation is weak, the quarter comes within 0.1 to 0.2 dB of
3/16, while an eighth stays 0.5 to 0.7 dB behind. On real photographs, unrelated channels want **more**
borrowing, not less. That is the reverse of what the synthetic tiles suggested.

One more number is worth keeping. In every correlation bin, the eighth beats the quarter on 49 to 60% of
sensels. Which way a single sensel should go is close to a coin flip, whatever its neighbourhood looks
like. The "oracle" that picks the best weight per sensel scores +2.0 dB, against +0.33 for the model.
Much of that gap may be chance no local measurement can predict. So the next step is to measure how
much of it is reachable at all, before trying a bigger model.

After the verdict we also scored the test sheet alone, as exploration and not as a test. The new
features made it worse: 39.24 dB, against 39.45 for the shipped model and 39.87 for the default. The
sheet's outer rings sit in the aliasing zone above a quarter cycle per pixel, which only 8% of real
binned sensels visit. More synthetic tiles will not fix that. Real near-Nyquist photographs, such as
fabric or fine print, might.

## What landed

Nothing in the shipped demosaic changed. What did land: the four features (numpy, picked by a model's
weight count), the trainer options `--extra` and `--synthetic-kind matched`, tests, and the full write-up
with every cross-validation row: `ventures/photo-editing/eval/bayer-channel-correlation-2026-11-16.md`.
A wrong explanation that would have shaped the next few runs is now on record as wrong, with the numbers.
