---
title: "How much better can a learned demosaic weight get? Most of the perfect answer lives inside four pixels"
seo_title: "Bayer demosaic learned weight: measuring the oracle ceiling"
date: 2026-11-16
description: "The perfect per-pixel weight gains 1.9 dB, but one weight per 4 x 4 block gains only 0.83. Our learned model is at 0.39, so one richer model is worth trying."
tags: [photo-editing, raw, demosaic, research]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, rebuilds the missing green at each
red or blue pixel of a raw file from its green neighbours, plus a fraction of the pixel's own second
difference. Earlier today we taught it to choose that fraction per pixel with a small linear model. Held
out, it cut green error by 0.385 dB against a fixed 3/16. A perfect per-pixel choice, made with the true
image in hand, would cut it by about 1.9 dB. Two attempts to close that gap with new features gained
0.01 dB or less.

Before trying something heavier (a tree ensemble, a small network), we wanted to know how much of the 1.9
dB is reachable at all.

## The measurement

We scored every red and blue pixel on 40 training raws, each clean and with noise added at two levels. For
each block size, we asked: if you could pick one perfect weight per block, how much would you gain? The
error is quadratic in the weight, so the best weight for a block can be computed exactly. The result is
a hard upper bound for any model whose weight is constant on blocks of that size.

| one weight per | gain over 3/16 |
|---|---|
| pixel | +1.91 dB |
| 2 x 2 block | +1.43 dB |
| 4 x 4 block | +0.83 dB |
| 8 x 8 block | +0.59 dB |
| 32 x 32 block | +0.41 dB |
| our learned model (same frames) | +0.41 dB |

Over half of the perfect per-pixel gain is gone by 4 x 4. The right answer changes from one pixel to the
next, in a way that earlier work found close to a coin flip for every local measure we tried. Our model
already does about as well as a perfect weight for every 32 x 32 block. It has learned the regional
choice. What it misses is the fine one.

We wrote down beforehand what would decide the next step: if the 4 x 4 ceiling came in under twice the
model's held-out gain (0.77 dB), we would stop on this weight. It came in at 0.83. So one richer model is
worth one try, and its realistic target is about +0.83 dB, not +1.9.

## The idea that did not work

The open item also suggested training on a smoothed target: the best weight averaged over a 4 x 4 box
instead of per pixel. In cross-validation it lost 0.062 dB. In hindsight that makes sense. Least squares
already averages over pixels that look alike to the model. Smoothing only pulls each pixel toward its
neighbours, which is wrong wherever the neighbours look different. The shipped demosaic is unchanged.

The numbers, the tool (`tools/bayer_oracle_ceiling.py`) and the commands to rerun it are in
`ventures/photo-editing/eval/bayer-oracle-ceiling-2026-11-16.md`. The raws are public samples from the
`drewnoakes/metadata-extractor-images` repository, so anyone can check them.
