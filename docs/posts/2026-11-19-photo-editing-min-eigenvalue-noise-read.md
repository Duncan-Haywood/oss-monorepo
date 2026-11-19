---
title: "Reading noise from the quietest direction failed on foliage, and showed a white-balance gap"
seo_title: "A min-eigenvalue noise read failed on foliage, and found a gap"
date: 2026-11-19
tags: [photo-editing, raw, noise, evaluation]
description: "A pre-registered smallest-eigenvalue noise read failed in ShootFlow's demosaic: foliage fills every direction. And the shipped read under-reads white balance."
---

ShootFlow's default raw demosaic blends two demosaics block by block. Where the
sensor noise is large next to the detail, it leans toward a smoother one. On raws
with no noise profile it has to read the noise from the frame itself, and it does
that with patch PCA. It cuts the mosaic into 6 x 6 patches, keeps the ones with
little texture, and reads the noise from the small eigenvalues of their
covariance, using Chen, Zhu and Heng's (2015) rule.

An earlier check this week found six test rows where that read is wrong in a way
that costs image quality. They are sunlit forest from a Nikon D780 at ISO 100 and
textured wallpaper from a D600. On these the read sees 2.3 to 5.2 times the noise
that was added, and the blend loses 0.11 to 0.18 dB to the plain directional
demosaic. On the clean frame with nothing added it reads almost the same: it is
reading the leaves, not the noise.

## The idea, and the rule written first

Texture usually lives in a few directions of the patch. White noise spreads
evenly over all 36. So the quietest direction, the smallest eigenvalue, should
hold the least texture. For pure noise the smallest sample eigenvalue sits at a
known place, the lower Marchenko-Pastur edge, sigma squared times
(1 - sqrt(36/n))^2 for n patches. Dividing by that edge gives an unbiased read
with no free parameter. A second version does the same on each colour's own
samples and averages them, because white balance gives the colours different
noise.

The rule was committed before any real tile was scored. One of the two reads is
picked on one set of raw.pixls.us sample files, but only if it loses no more rows
than what ships. The pick is then tested on a separate set against three
thresholds.

## What happened

The pick stopped it. On the tuning set what ships has no row losing over 0.1 dB.
The plain read added 1 and the per-colour read added 4. Nothing in the shipped
code changed.

The held-out set was run anyway as a reading, and it agreed. The plain read went
from 6 losing rows to 10, and the per-colour read to 21. On the six forest and
wallpaper rows both were worse than what ships, not better.

The mechanism is the useful part. On the D780 forest tile the read was not lower
in the quietest direction. Foliage at the sampling limit fills every direction of
the patch, the quiet one included. The weak-texture test also kept only 8% of the
patches there, about 590 per brightness bin. At that count the Marchenko-Pastur
edge is 0.57, so the division that makes white noise read right multiplies
leftover texture by 1.75. The patch sets are smallest exactly where the texture
is densest.

## The gap it found

The per-colour read lost on foliage, but it also raised the average gain by
0.11 dB of luma, and by 0.25 dB on the noisiest white-balanced rows. It could
only do that by reading higher where the shipped read is too low. At SNR 12 the
shipped read gives a median 0.53 of the true noise when white balance has scaled
the colours apart, and 0.75 when it has not. Given the true model, the blend gains
1.02 dB of luma over directional. What ships gains 0.70.

So the shipped read has two faults that pull opposite ways. It reads foliage as
noise, and it reads white-balanced noise low. One global change cannot fix both.
The next attempt splits them: take the colours' noise ratios from the per-colour
read, and the level from the shipped read on colour-whitened patches. That rule
will be committed before it is scored, like this one.

The rows, the rule and the full output are in the repository at
`ventures/photo-editing/eval/noise-pca-min-eigen-2026-11-19.md`.
