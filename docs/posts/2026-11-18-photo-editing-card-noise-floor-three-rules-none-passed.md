---
title: "A card-level noise floor on 182 real cameras: three rules committed first, none passed"
seo_title: "Card-level noise floor on 182 cameras: none of three rules passed"
date: 2026-11-18
tags: [photo-editing, raw, denoising, statistics]
description: "ShootFlow reads a raw file's noise from the frame. Capping that reading at the card's lowest fixed 17 of 24 losses but missed its pre-set bar by 0.005 dB."
---

ShootFlow's raw developer has a noise-aware demosaic. Where the directional
demosaic adds less detail than the sensor's own noise, it blends toward plain
bilinear. To do that it needs the noise. Most raw files carry no noise
profile, so since 2026-11-17 the developer reads the noise from the frame
itself, by patch PCA. It then scales the reading to 0.8 and caps it.

A frame can only read its own noise so well. Fine texture (gravel, foliage,
fabric) looks like noise to any estimator that sees one frame. [Yesterday's
note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/noise-scale-per-frame-2026-11-17.md)
found one such crop, and every rule that tried to raise the 0.8 lost up to 2.5
dB on it. Its proposed way out: frames from one camera at one ISO share the
sensor's noise but not their scenes. So the lowest reading across a memory
card should strip out the texture. That set could not test it: 39 of its 45
files gave one tile each.

## The data

[raw.pixls.us](https://raw.pixls.us/) hosts CC0 sample raws for hundreds of
cameras, often several per body. I fetched 158 files from 29 bodies. The first
finding came before any scoring: **most of these multi-file sets are one scene
saved several ways.** It might be an ISO series of one view, 12- and 14-bit
copies, compressed and uncompressed, or four aspect ratios. A floor taken over
two copies of one scene strips nothing.
[`tools/card_scenes.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/tools/card_scenes.py)
compares each pair of a body's files at the same pixel scale and keeps one file
per scene. It removed 75 of the 158; 83 scenes stayed.

As in the earlier notes, each scene is binned 4 x 4 into a near-clean truth.
Noise of known size is drawn on it at four levels, and each demosaic is scored
against the truth. That gives 1,272 rows, split into tune and held by body.

## Three rules, each committed before its rows existed

1. **Replace the frame's reading with s times its card's lowest.** Picked on
   tune rows, s = 1. It failed held out: 0.02 dB less luma than what ships, and
   2 rows worse than directional. The floor is a minimum of noisy readings, so
   on noisy frames it reads low: 0.51-0.76 of the true noise at the noisiest
   level. White balance spreads a card's readings further.
2. **Keep what ships, but cap it at s times the floor.** Picked on tune rows,
   s = 1, which gave up 0.11 dB held out. Failed. The near miss was s = 1.5.
   Its one tune row past the line was a -0.10 dB row where the cap does not
   even bind.
3. **The cap at s = 1.5, fixed, on bodies nothing had seen.** I fetched 521
   more files from 153 other bodies: 371 scenes and 4,040 rows, each scored
   once. The rule: adopt it only if mean luma and colour stay within 0.01 dB
   of what ships, and it adds no row worse than directional.

| on 153 fresh bodies | mean luma gain | mean colour gain | rows worse than directional by > 0.1 dB |
|---|---|---|---|
| what ships | +0.4523 dB | +0.2990 dB | 24 (worst -0.53) |
| cap at 1.5 x the card's floor | +0.4375 dB | +0.2935 dB | 7 (worst -0.53) |

The cap fixes 17 of the 24 losing rows and adds none. It costs 0.0148 dB of
mean luma, and the bar was 0.01. **It does not ship.** The developer is
unchanged.

## What the run did establish

- **What ships loses a little on real full-size frames.** Across both sets, 42
  of 5,312 rows (0.8%) come out worse than directional by over 0.1 dB, worst
  -0.53 dB. All of them are near-clean frames whose fine detail reads as 1.4 to
  25 times the noise. The earlier check had found none, because it used small
  binned frames.
- **A card helps only when it has more than one scene.** All 7 rows the cap
  could not fix are on cards where the losing frame is its own floor. Five come
  from bodies with a single scene.
- **The bar caught a real cost.** The minimum's downward bias is what costs the
  0.015 dB. The next try is a gentler floor: the second-lowest reading, or one
  taken before white balance. It has to be tested on a set none of this has
  touched, which for raw.pixls.us means its Fujifilm X-Trans bodies.

Everything is in the
[eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/noise-card-floor-real-2026-11-18.md):
all three rules as committed, every row, the URL list and the commands to rerun
it.
