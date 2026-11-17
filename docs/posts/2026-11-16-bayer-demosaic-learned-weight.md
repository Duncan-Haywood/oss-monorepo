---
title: "Teaching a demosaic when to trust each pixel: a 45-number model that beats our default on ten unseen raws"
seo_title: "A learned per-pixel demosaic weight, tested on 10 held-out raw files"
date: 2026-11-16
description: "A small model fitted on 40 sample raws picks each pixel's demosaic weight. On ten raw files it never saw, colour and luma both beat our default on every one."
tags: [photo-editing, raw, demosaic, machine-learning, research]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. Its Bayer demosaic builds the green at each red or blue pixel from two neighbouring greens, plus a fraction of the pixel's own second difference. The fraction is fixed at 3/16. Earlier today a hand-made rule let each pixel pick its own fraction. It helped some frames and hurt the two finest ones. The note that rejected it ended with the obvious next step: learn the choice from many frames, and keep the ten frames already scored as a test set only.

## What we built

Each pixel gets eight measurements. They include how curved the signal is compared with how steep it is, whether the row and column greens agree, and how clearly an edge picks a direction. Every one is a ratio, so exposure and white balance don't move it. The weight is a quadratic in those eight numbers: 45 coefficients in all, clipped to between an eighth and a quarter.

The fit has a useful shortcut. Between an eighth and a quarter, the demosaiced green moves almost linearly with the weight. So we demosaic each training frame twice, at an eighth and at a quarter. That gives the best weight for every pixel and how much that pixel's error depends on the weight. Fitting the model is then a weighted least-squares problem, with no iterative training at all.

We used 40 training frames, every Bayer raw in a public sample set except the ten test frames, which the training tool refuses outright. They span 30-odd camera bodies, two drone files and a phone. We chose the model (linear or quadratic, and how much regularisation) by leaving one training frame out at a time. The test frames played no part in that choice.

## What it did on frames it never saw

| | colour PSNR vs default | luma PSNR vs default |
|---|---|---|
| ten real frames (A7 III, A7 IV, D810, D800E, 70D, 7D, E-M10, K-1 II, GF7, NX1) | +0.01 to +0.39 dB, mean +0.14, better or equal on 10 of 10 | +0.02 to +0.66 dB, mean +0.29, better on 10 of 10 |
| synthetic zone-plate sheet | -0.45 dB | -1.56 dB |

The A7 III and Pentax K-1 II were the two frames where this morning's rule lost detail. The learned weight gains on both. It also does better than this morning's rule on all ten real frames, and with added noise it is still equal or better on all ten.

## Why it is not the default yet

Two reasons. First, the synthetic test sheet, a zone plate pushed right up to the sensor's resolution limit, is unlike any photograph in the training set, and the model does worse there than the fixed 3/16. Second, it runs only in numpy, at four to six times the time of the default's C path. So it ships as an option: `shootflow develop FILE --demosaic learned`.

The gap left is large. A pixel-perfect choice would cut green error by about 2 dB, and the model gets a third of a dB on frames it didn't see. The next steps are in the note: a C path, training with noise and with near-resolution-limit content, and a slightly richer model on the same features.

Full tables, commands and the training tool: `ventures/photo-editing/eval/bayer-learned-laplace-2026-11-16.md` and `tools/bayer_laplace_train.py`. As with all our demosaic notes, the test frames come from a public sample set and the "truth" is each frame rendered and binned 4 x 4. That is a good proxy, but it is not a lab chart.
