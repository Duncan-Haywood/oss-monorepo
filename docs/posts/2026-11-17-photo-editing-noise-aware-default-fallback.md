---
title: "Raws with no noise profile now read their own noise: 52 real files through the new default"
seo_title: "Noise-aware demosaic: frame noise is now the default fallback"
date: 2026-11-17
description: "ShootFlow's noise-aware demosaic now reads the noise from the frame when a raw has no NoiseProfile. All 52 sample raws took it: what it changed and cost."
tags: [photo-editing, raw, demosaic, noise]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, has a noise-aware demosaic
(`--demosaic noise-aware`). Where the edge-keeping demosaic is only following noise, it blends toward plain
averaging. To know how loud the noise is, it used the DNG NoiseProfile tag. Most raws don't have one: no
ARW, NEF, CR2, ORF, RW2 or RAF file carries it. For those it fell back to the plain directional demosaic,
unless you passed `--noise-from-frame`.

Earlier today that flag got a patch-PCA estimator, and then a texture test made for X-Trans sensors. Since
then, on held-out tiles with known truth, no tile on either sensor layout lost more than 0.1 dB to
directional. That was the condition for making it the default, so tonight it is the default.
`--no-noise-from-frame` brings back the old fallback.

## Checked on whole real frames

Synthetic tests can't tell you whether something breaks on a real file, so we ran the new default over
every raw in a public sample set: 60 files from about 50 bodies. Each was developed at full size twice, once
directional and once noise-aware.

- **53 developed.** The other 7 fail in the file readers before any demosaic runs (no TIFF header,
  truncated, BigTIFF), the same 7 that failed before.
- **All 52 without a profile used the frame-read model.** None fell back. The one DNG with a profile, a
  Nexus 5X, kept using its profile.
- **It does more as ISO rises.** At ISO 50-200 the blend changed a median 1.5% of pixel values, and the
  output was 58 dB from directional's. At ISO 800-6400 it changed 23% (48 dB). On an ISO 6400 Olympus TG-4
  frame it changed 70%. The correlation is loose (Spearman +0.28 with the noise it read), as you'd expect
  across unrelated scenes and cameras that denoise their raws.

There was one row we can't explain yet. A Pentax K-1 Mark II frame at ISO 1600 came out byte-identical
to directional.

## What it costs

The frame read and the blend add about 0.5 s per megapixel, a median 6.7 s per frame, and up to 6.4 GB of
memory on a 36 MP file. Four 36 MP files in parallel ran this 15 GB container out of memory. So the default
*demosaic* stays directional. Noise-aware is still something you ask for, and when you do, it now works on
any raw. Cutting the time and memory comes next.

Every row, the tool and how to rerun it: `ventures/photo-editing/eval/noise-fallback-real-2026-11-17.md`.
