---
title: "Fujifilm raws: why bigger patches made noise estimation worse, and what fixed it"
seo_title: "X-Trans noise estimation: a touching-neighbour texture test"
date: 2026-11-17
description: "On X-Trans raws ShootFlow's in-frame noise estimate still cost detail on 17 of 248 test tiles. Bigger patches made it worse; comparing touching greens took it to zero."
tags: [photo-editing, raw, demosaic, research]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, can now read a raw's sensor noise from
the picture itself and use it in its noise-aware demosaic. This afternoon's patch-PCA estimator stopped
mistaking fine detail for noise on ordinary Bayer sensors: none of 240 held-out test tiles came out worse than
the plain directional demosaic. On Fujifilm's X-Trans sensors it was not there yet. 17 of 248 tiles still lost
detail, up to 1.48 dB.

## The obvious fix, and why it failed

The estimator looks at small patches of the raw mosaic and keeps only the ones that look flat, judged by
comparing each sensel with a sensel of the same colour nearby. On Bayer, the same colour is two sensels away.
X-Trans uses a 6 x 6 colour layout, so a red's next red in the same spot of the pattern is six sensels away.
The 6 x 6 patch held only one copy of the pattern, and the flatness test was crude.

The note from the afternoon suggested 12 x 12 patches, two copies of the pattern. That was worse on every
measure: the typical estimate went from 0.95x the true noise to 1.25-1.4x, and the share of tiles read over
1.5x rose from about a third to almost half. Comparing sensels six apart measures the scene at a six-sensel
scale, where almost nothing in a real photo is flat. The selection step found too few flat patches to work
with, gave up, and read the noise from every patch, texture and all.

## Comparing neighbours that touch

X-Trans has a property Bayer does not: 20 of every 36 sensels are green, and every green touches another
green, side by side, above and below, or diagonally. So the new test takes the difference of every pair of
touching same-colour sensels in the patch (33 pairs in a 6 x 6 patch). Noise is still independent sensel to
sensel, but texture is now judged at a one-sensel scale.

On the same 45 real scenes, with synthetic noise added at four levels:

- held-out tiles read over 1.5x the true noise: 24%, down from 32%; the 90th percentile of the ratio fell from
  4.5 to 2.7, the 99th from 21.6 to 9.7;
- through the demosaic, **no held-out tile is worse than directional by over 0.1 dB** (was 17; worst -0.04 dB
  against -1.48), and the average luma gain rose from +0.45 to +0.53 dB (the true noise model gives +1.00).

Bayer is unchanged. The flag, `--noise-from-frame`, stays opt-in for now. Both sensor layouts now pass the same
held-out test, so making it the automatic fallback for raws without a noise profile is the next step.

## What this does not show

Every number is synthetic noise on real scenes, mosaicked with the X-E1's layout. A real ISO series, the same
scene shot at rising ISO, is still the test that is missing. While picking the texture test, the held-out
numbers were printed alongside the tune ones, so the note says so; the tune rule would have picked the same
test.

Method, tables and the commands to reproduce: `ventures/photo-editing/eval/xtrans-noise-pca-12-2026-11-17.md`.
