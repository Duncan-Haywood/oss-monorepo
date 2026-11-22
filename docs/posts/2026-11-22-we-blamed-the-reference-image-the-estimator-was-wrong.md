---
title: "We blamed the reference image for a noise estimator's losses. A pre-registered test said otherwise"
seo_title: "Does a noisy ground truth explain a raw-noise estimator's losses?"
date: 2026-11-22
tags: [photo-editing, raw, noise-estimation, pre-registration, negative-result]
description: "A green-pair reading of each reference image's grain failed its own validity tests, and the estimator's losses on one Pentax file turned out to be its own."
---

The photo developer in `ventures/photo-editing` estimates a raw file's noise
from the frame itself, and its noise-aware demosaic uses that estimate to
decide where to smooth. To score an estimator we take a real raw, shrink it
4 x 4 into a nearly clean reference, add noise of a known level, and see how
well the demosaic recovers the reference.

Yesterday's run shipped a better estimate for white-balanced files (`mpcw`)
and found a variant (`mpcws`) that gained three times as much on held-out
tiles. That variant failed its pre-registered pick on one file: ten losing
rows, every one on a Pentax K-1 Mark II frame shot at ISO 1600 for 30
seconds. The working theory was that this reference wasn't clean. The
4 x 4 shrink averages away white grain, but a long exposure's noise can be
correlated across neighbouring sensels, and correlated noise survives
averaging.

## The test we committed to first

We needed a second way to read each reference's grain at the scale the
reference actually has. Every 2 x 2 Bayer cell has two green sensels. Average
each green site separately over the same 4 x 4 blocks, subtract one from the
other, and the scene mostly cancels. What remains is the noise of a 4 x 4
block, correlated or not. Before computing it on any file, we committed
(in git, with a timestamp) to two validity tests:

- **P1:** on all three K-1 II tiles, the new reading is at least 1.5 times
  the old one (the theory says it should be).
- **P2:** on the other files the median ratio is between 0.67 and 1.5,
  including on textured tiles (otherwise the reading is seeing the scene,
  not the noise).

If either failed, the reading would not be used to judge any row.

## Both failed

| test | result | bar |
|---|---|---|
| P1, K-1 II's three tiles | 1.85, 2.11, **0.16** | each at least 1.5 |
| P2, 62 other tiles | median 2.11 | 0.67 to 1.5 |
| P2, 5 textured tiles | median 5.44 | at most 1.5 |

The reading works where the scene is flat. On full-size frames from the
Sony A7 III, A7 IV, NEX-7 and Nikon D800E/D810, 11 of 13 flat tiles agree with
the old reading to within 0.96 to 1.27. On small frames (median 2.6x) it
picks up detail: the two green sites sit one sensel apart diagonally, and on a
small sensor one sensel covers more of the scene. On one K-1 tile it read
0.16x, which is what happens when both green sites share the same noise.
The difference cancels shared noise, and a unit test now shows exactly that.

## And the losses weren't the reference's fault anyway

Two readings made after the verdict, which decide nothing on their own:
even if the reading had passed, the K-1 II's SNR 12 rows would still count
as clean, and `mpcws` would still lose there (6 losing rows against 2). And
on the tile where only `mpcws` loses, the read numbers make the cause plain:

| K-1 II [372, 678], SNR 25 | sigma at 18% grey |
|---|---|
| reference grain and added noise together | about 0.013 |
| `mpcw` (what ships) | 0.0146 |
| `mpcws` | 0.0299 |

`mpcws` reads more than twice the noise that exists. It lets its own
estimate set the threshold for which patches count as "flat", so a high
estimate admits more texture, and the extra texture raises the estimate
again. That loop is the estimator's own fault, and it is the next thing to
test: select patches with `mpcw`'s level in one pass and read the level with
`mpcws`. That will be pre-registered the same way, with "no more than 1.3x
`mpcw`'s read on that tile" as one of its stated checks.

Nothing in the shipped developer changed today. The default stays `mpcw`.
The green-pair reading is now a tool (`tools/truth_noise_check.py`, column
`gg18`), the full note with every number is
`ventures/photo-editing/eval/noise-pca-mpcws-noisy-truth-2026-11-22.md`, and the
raws are the public samples in `drewnoakes/metadata-extractor-images`.
