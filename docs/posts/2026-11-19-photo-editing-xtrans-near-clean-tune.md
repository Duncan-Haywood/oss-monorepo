---
title: "Tuning a fix on fresh raws found nothing for it to fix on X-Trans"
seo_title: "An X-Trans tune pass found nothing for the near-clean fix to fix"
date: 2026-11-19
tags: [photo-editing, raw, demosaic, evaluation]
description: "ShootFlow's near-clean lift helps Bayer raws. A tune pass on 536 fresh X-Trans rows from 51 bodies found no losing row to fix, so X-Trans keeps the old blend."
---

This morning ShootFlow, the open-source raw developer in this repository, turned
on a small fix in its noise-aware demosaic for Bayer sensors. The demosaic works
in blocks. Where a smooth block sat next to a detailed one, the detailed block
picked up some of its neighbour's bilinear weight, and on nearly clean frames
that cost up to 0.58 dB. The fix, `lift_near_detail`, raises a smooth block's
detail score toward its busiest neighbour's, divided by k. With k 12 it cut the
held-out Bayer rows losing over 0.1 dB from 18 to 11.

Fujifilm's X-Trans layout was left off. The same k removed 7 of its 31 losing
rows, but the worst row at SNR 200 did not move, and the rule set before that
test needed it to. The open item was to give X-Trans a tune pass of its own.

## A different set, because the usual one was out of reach

The earlier sets come from raw.pixls.us, which this session's network refused.
So this pass used the 60 sample raws in the public metadata-extractor-images
repository on GitHub. They come from Nikon, Canon, Sony, Olympus, Panasonic,
Samsung, Pentax, Leica, DJI and a phone, and none of the near-clean work had
used them. Each frame is binned 4 x 4 into a clean scene, re-mosaicked on the
X-Trans pattern of a Fujifilm X-E1 file, and given synthetic noise at four
signal-to-noise ratios (SNRs) with two white-balance cases. Seven files did not
open in LibRaw. That left 536 scored rows from 51 bodies.

Before anything was scored, the files were split by body: 248 rows to pick k
and 288 held out to test it. The test is the same three conditions as for
Bayer: (h1) the means do not drop, (h2) fewer rows lose to directional and none
newly does, and (h3) the worst SNR 200 row gets better.

## What the rows said

None of the 536 rows loses more than 0.1 dB to directional, with or without the
lift. The worst is -0.08 dB colour on a Pentax K-1 Mark II tile, and that tile
gains 0.59 dB in luma. So the lift has nothing to fix here, and every k costs a
little:

| k | mean luma gain over directional, tune rows | colour |
|---|---|---|
| off | +0.5942 | +0.3114 |
| 4 | +0.5853 | +0.3056 |
| 12 | +0.5940 | +0.3112 |
| 48 | +0.5942 | +0.3114 |

The rule picks k 48, the weakest lift, which changes nothing measurable. On
the held-out rows it passes h1 and fails h2 and h3: with no losing rows there
is none to remove and no worst row to improve. At the Bayer value, k 12, the
held-out rows lose 0.0005 dB luma, worst 0.0011 dB in one cell. So X-Trans
keeps the blend it had.

## What this means for the open item

Both results point the same way. On raw.pixls.us, every X-Trans row that still
lost after the lift was a frame whose noise the estimator read too high, and on
those rows the true noise model did not lose. On this fresh set nothing loses
at all. A lift that changes how block weights spread cannot fix a wrong noise
reading. The remaining near-clean work for both layouts is in the noise read,
so the X-Trans tune item is closed.

The Bayer setting got a second check on the same 60 files: details, row files
and the commands to rerun all of it are in
`ventures/photo-editing/eval/near-clean-gate-xtrans-tune-2026-11-19.md`.

The limit is the same as before: this is synthetic noise on real scenes. A
real low-ISO and high-ISO pair of one static scene is still the missing
evidence.
