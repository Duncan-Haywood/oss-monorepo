---
title: "Reading sensor noise from the photo itself: where it works, and the texture that fools it"
seo_title: "Noise-aware demosaic for raws with no noise profile"
date: 2026-11-17
description: "ShootFlow's noise-aware demosaic now works on raws with no NoiseProfile, opt-in. On noisy frames it keeps 80-94% of the gain; fine texture fools it."
tags: [photo-editing, raw, demosaic, research]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, has an opt-in noise-aware demosaic.
Where edge-keeping only follows noise, it leans toward plain averaging. To do that it has to know how noisy the
sensor is, and until today it got that only from a DNG's NoiseProfile tag. Sony ARWs, Nikon NEFs, Canon CR2s,
Fujifilm RAFs and most other raws don't carry one, so on those files the mode did nothing.

The obvious fix is to measure the noise from the picture: find the flattest patches and see how much the pixels
jitter. The codebase already had such an estimator. An earlier note said it "lost up to 5 dB" when used
directly. So the question today was whether it could be scaled down far enough to be safe.

## Scaling it down did not make it safe

We drew noise at four levels on 58 tiles from 46 real camera files (binned 4x4 so the reference is nearly
clean), fitted on 21 files and scored on 25. No scale worked. At 0.4x the estimate the blend barely acts, and a
few held-out tiles still lose 0.5-0.9 dB. At 0.8x it gains about two thirds of what the true noise model gains,
but 44-49 of 248 held-out rows lose more than 0.1 dB, and the worst lose 4-6 dB.

## The losses came from texture, not grain

The losses sat in the low-noise rows. So we ran the estimators on the clean reference tiles, with nothing added.
They read a median sigma of 3.3e-3, more than the noise we drew at SNR 60 (3.0e-3) and SNR 200 (0.9e-3).

Was that leftover sensor grain? Binning the reference 8x8 instead of 4x4 should halve white noise. The reading
moved by a median 0.95x. So the "noise" in the cleanest patches is fine texture: grass, fabric, brickwork.
It is detail the scoring rightly protects, and it looks exactly like noise to an estimator that sees one frame
at one scale.

We tried three ways around it. A lower percentile of patches lowered the median overstatement, as did a Haar
wavelet residual per colour plane. A two-scale reading was the third: white noise halves from one wavelet scale
to the next while self-similar texture doesn't, so the difference isolates the noise. It halved the median
overstatement. None of them fixed the tail. A handful of tiles with very fine structure read 3x too high under
every estimator, even at heavy noise.

## Where it does work

Sorting each tile by how loud the added noise is against the tile's own finest detail gives a clean split. Where
the noise is at least as loud as the texture (a high-ISO frame), the frame-read model at 0.8x keeps 80-94% of the
true model's luma gain. That is +0.79 to +1.72 dB over directional on Bayer and +0.99 to +1.94 dB on X-Trans,
with 8 of 272 held-out rows losing over 0.1 dB, five of them one tile. Where texture is louder than the noise
(a clean base-ISO frame), it softens detail.

So it shipped as a flag rather than as the default:

```
shootflow develop FRAME.ARW --dcp CAMERA.dcp --demosaic noise-aware --noise-from-frame --out masters/
```

Without the flag nothing changes. A file with a real NoiseProfile ignores it. The develop notes say which noise
model was used.

## What would make it automatic

The pixels can't tell texture from noise, but the file can: every raw records its ISO, and most have a masked
optical-black strip whose jitter is pure read noise with no texture at all. Fitting a per-body "noisy enough"
switch needs real ISO series of one static scene, which is the open item. The full measurement, every table and
the commands are in `ventures/photo-editing/eval/noise-aware-estimated-2026-11-17.md`.
