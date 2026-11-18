---
title: "Why the noise scale stays at 0.8: one held-out tile decides it"
seo_title: "Noise-aware demosaic: why a higher noise scale failed held-out"
date: 2026-11-17
description: "We tried 861 rules to push ShootFlow's frame-read noise scale above 0.8, all picked on tune tiles only. Every one that won on tune lost on one held-out crop."
tags: [photo-editing, raw, demosaic, noise, negative-result]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. Its noise-aware demosaic needs to
know how loud the sensor noise is. Most raw files don't say, so since tonight it reads the noise from the frame
itself with a patch-PCA estimator. It then multiplies that reading by 0.8 before using it.

The 0.8 leaves gain on the table. On noisy test tiles with known truth, it keeps only 41-71% of the
improvement the true noise model would give. It was also chosen after looking at the held-out tiles, so it was
never a clean pick. The obvious follow-up was to pick the scale again from the tuning tiles alone and see
whether a larger one survives the held-out set.

It doesn't.

## What we tried

The test set is 45 real raw files from a public sample repository, binned 4 x 4 so the binned image can serve
as the truth. Each file gets synthetic noise at four levels, in two flavours. That gives 216 tuning rows from
27 tiles and 240 held-out rows from 30 tiles, split by file. We tried two kinds of rule:

- **A constant scale** on a finer grid: 0.8, 0.9, 1, 1.1, 1.25 and 1.5.
- **Two-level rules.** These use a higher scale only where the frame's own statistics say its spread is mostly
  noise, using three statistics:
  - how much more block spread reads than PCA does;
  - the share of patches that PCA's texture test keeps;
  - how much the reading drops when the mosaic is binned. White noise halves; scene texture doesn't.

That makes 861 rules. Each was judged only on the tuning rows: best mean gain, with no tuning row worse than
the plain directional demosaic by more than 0.1 dB.

## What happened

The tuning rows never push back. Every scale up to 1.25 keeps every tuning row within 0.07 dB of directional,
so the pick climbs to 1.25, from a constant or a rule. On the tuning tiles, 1.25 even beats the true model.
On held-out tiles it loses up to 2.51 dB, and 11 rows come out worse than directional. A stricter safety margin
still loses 2.51 dB. Even a scale of 0.9 loses 0.21 dB on four held-out rows.

At every scale up to 1.1, all of those losing rows come from one crop of one Sony NEX-5N frame. That crop has
fine, grain-like detail. PCA reads it as noise of the same strength at every noise level, including a nearly
clean one where the true noise is 27 times weaker. None of the three statistics flags it: by all three it looks
like an ordinary noisy frame. Leave that one crop out and a scale of 1.0 would keep 92% of the true model's
gain. Leaving it out after seeing it, though, is not a test, so the scale stays at 0.8.

## What might work instead

A single frame can't separate fine grain from noise. A memory card often can. Frames from one camera at one
ISO share the sensor's noise but not their subject, so the lowest reading across them should leave scene
texture out. The tool now has a `--card` mode that tests this. This set can't answer the question, though: 39
of its 45 files give only one tile, the NEX-5N among them. The next step is real multi-frame sets from one body.

Everything is reproducible from `tools/noise_aware_estimated.py` (`adapt`, `sweep --features-only`,
`sweep --card`), with every row in `eval/noise-scale-per-frame-2026-11-17.md`.
