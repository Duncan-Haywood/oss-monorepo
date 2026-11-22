---
title: "We cut a noise estimator's feedback loop. The gain went with it"
date: 2026-11-22
tags: [photo-editing, raw, noise-estimation, pre-registration, negative-result]
description: "A one-pass fix for a raw-noise estimator that over-read a Pentax frame failed all three pre-registered gates and kept 4% of the gain it was meant to save."
---

The photo developer in `ventures/photo-editing` estimates a raw file's noise
from the frame itself, and its noise-aware demosaic smooths by that estimate.
The estimator picks "flat" patches of the mosaic (texture energy below a
threshold set by the current noise estimate), then reads the noise level from
those patches' covariance.

Earlier today we traced why one variant, `mpcws`, lost on a Pentax K-1 Mark II
frame: it lets its own reading set the flatness threshold and iterates. A
high reading admits more texture, which raises the reading again. On one tile
it read 2.3 times the noise that was there. The obvious fix is to break the
loop: pick the patches the way the shipped read (`mpcw`) does, apply one more
threshold at `mpcw`'s level, read once, stop. We called it `mpcw1`.

## The gates, written down first

Before scoring a single real row with `mpcw1`, we committed the rules:

- **C:** on the K-1 tile where `mpcws` over-read, `mpcw1` reads at most 1.3
  times `mpcw` on every row.
- **Pick** (tune split): higher mean gain over the plain directional demosaic
  than `mpcw`, and no more rows losing over 0.1 dB to it.
- **Test** (held split): the same three bars that shipped `mpcw` on
  2026-11-21.

Then we rescored the same 53 public raws (536 rows, about 35 minutes on four
cores). A reproduction check came first: the rerun's `mpcw` and `mpcws` arms
match the committed rows on 99.25% and 99.91% of scores. The misses are on
two Fujifilm files.

## All three gates failed

| gate | result | bar |
|---|---|---|
| C, worst ratio on the K-1 tile | 1.48 | at most 1.3 |
| pick, losing rows | 7 (`mpcw`: 6) | no more |
| test, worst (SNR, scenario) cell | -0.052 dB | at least -0.02 |

`mpcw1` does help where it was supposed to help: white-balanced files at low
signal-to-noise, +0.107 dB luma at SNR 12 held out. But the number that
matters most is this one. On the tune split `mpcws` beats `mpcw` by +0.256 dB.
`mpcw1` keeps +0.010 of that.

So the gain and the over-read come from the same mechanism. Admitting more
patches when the reading is high is what lifts white-balanced files that the
shipped read under-reads, and it is also what runs away on a textured long
exposure. A selection tweak of this shape cannot keep one without the other,
at least not on these files.

## What changes

Nothing in the shipped developer: `mpcw` stays the Bayer default. `mpcw1`
stays in the code as an opt-in read (`eig="mpcw1"`), so a later sweep can
score it. The bigger conclusion is about the data. This is the third
pre-registered noise-read test on the same 53 files, and none of the splits
is blind to the whitened reads any more. The next test of patch selection
needs a fresh set of raws (raw.pixls.us refused this session's connection),
with both variants scored side by side.

The full note, rows and output are in
`ventures/photo-editing/eval/noise-pca-mpcw1-2026-11-22.md`. The raws are the
public samples in `drewnoakes/metadata-extractor-images`.
