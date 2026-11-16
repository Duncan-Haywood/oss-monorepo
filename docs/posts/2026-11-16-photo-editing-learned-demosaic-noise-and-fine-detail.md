---
title: "Teaching a demosaic weight about noise worked a little; teaching it fine detail backfired"
seo_title: "Learned Bayer demosaic: noisy training helps, fine detail backfires"
date: 2026-11-16
description: "ShootFlow's learned demosaic weight, refit on noisy mosaics, gains a little under noise. Synthetic fine detail made it worse, for a reason about colour."
tags: [photo-editing, raw, demosaic, machine-learning]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. Its opt-in `--demosaic learned`
picks one number per pixel: how much of a red or blue sensel's own detail its green should borrow.
A small fitted model chooses it from eight local measurements. When it shipped this morning, two gaps
were written down. It had been trained only on clean mosaics, and at a realistic noise level a plain
fixed weight of 1/8 still beat it on three of ten held-out frames. And on a synthetic test sheet with a
zone plate up to the finest detail the sensor can record, it lost to the default.

This run went after both, with the test written down before the test frames were touched.

## Noise: a small, real gain

The trainer can now add a noisy copy of every training frame (at SNR 25 and 50). The features are
computed on the noisy mosaic, but the target stays the clean picture. The model learns which weight a
*noisy* sensel should get. On the training frames alone, holding each frame out with its noisy copies,
this raised the gain over the default at SNR 25 from +0.38 to +0.45 dB of green error, for 0.02 dB
noise-free.

On the ten test frames, run once, it passed. At SNR 25 colour accuracy is equal or better than the
first fit on 8 of 10, and better than the 3/16 default on all ten. Noise-free it gives back 0.023 dB on
average and still beats the default on all ten. Where fixed 1/8 still leads under noise, the gap is now
0.01 to 0.02 dB instead of 0.04 to 0.06. That is small, and the note says so. But it is the kind of
small that holds across every camera, and it costs nothing at run time: same model, same C path, same
speed. It is the shipped weight now.

## Fine detail: the obvious fix made it worse

To fix the sheet, the natural move is to show the model fine detail. I generated 16 frames of
gratings, weaves and print-like strokes up to the sensor's limit, deliberately unlike the test sheet,
and added them to training. The sheet got worse: 38.64 dB, down from 39.42, with more false colour.
On real photographs the cross-validated gain dropped too, at every weight tried.

The reason is in one table. On the synthetic gratings, fixed 1/8 beats the default on 45 of 48 copies.
On the grey zone plate, the default beats 1/8 by 5.35 dB. Both are "fine detail". The difference is
colour. The Laplacian term borrows the red or blue sensel's own curvature as an estimate of the green
curvature. When the channels move together, as in a grey pattern, that borrowing is right. On a
grating between two unrelated colours, it is wrong. My synthetic frames were mostly the second kind, so
the model learned "fine detail: borrow less". That is the wrong lesson for grey detail and for most
real photographs.

So the useful result is a sharper question. The weight should follow how strongly the channels' fine
detail is correlated, and none of the eight current features measures that directly. That feature,
and synthetic frames whose colour correlation matches real photographs, are the next step.

The full note, with every number, the pre-registration and the commands, is in
[`eval/bayer-learned-noisy-nyquist-2026-11-16.md`](../../ventures/photo-editing/eval/bayer-learned-noisy-nyquist-2026-11-16.md).
