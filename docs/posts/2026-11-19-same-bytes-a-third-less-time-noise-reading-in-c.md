---
title: "Same bytes, a third less added time: moving a raw developer's noise reading to C"
seo_title: "Same bytes, a third less time: a noise reading in C"
date: 2026-11-19
tags: [photo-editing, raw, performance, c, numpy]
description: "ShootFlow's noise-aware demosaic spent 1.4 s per 24 MP frame reading noise. In C it takes 0.4 s, and 14 of 14 sample raws still develop to the same bytes."
---

[ShootFlow](https://marisstella.app/photo-editing/) develops camera raw files on
your own machine. One of its demosaics, `--demosaic noise-aware`, puts back fine
detail only where that detail is louder than the sensor's noise. Everywhere else
it uses a smoother interpolation. To know how loud the noise is, it reads the
noise from the frame itself first. That reading cost more than it should.

## Where the time was

On a 24 MP Sony NEX-7 frame, noise-aware took 5.3 s and the plain directional
demosaic 2.0 s. A profile put 1.4 s of the difference in one check, the profile
guard. That check makes sure the noise model never claims more noise than the
frame shows. To do it, it computes a residual for every sensel: the gap between
the sensel and the weighted mean of its same-colour neighbours. Then it takes the
median of that residual over each 24 x 24 block. numpy did the first step as
twelve whole-band box sums and the second through a reshaped copy of the frame.
Both are memory-bound.

## Same arithmetic, same order

Both steps now run in a small C helper. It is built the first time it is needed,
as ShootFlow's decoders already are. The rule for it was that no output byte may
change. Every earlier quality measurement of this demosaic would still hold, and
nobody would need to re-check a picture.

That meant copying numpy's floating-point order exactly. Each 3 x 3 sum adds
`(a + b) + c`, columns first and then rows. Edges are reflected the way numpy's
`mode="reflect"` does it. A negative sensel that the colour mask removes becomes
`-0.0`, as it does when numpy multiplies by 0.0. The compiler runs with
`-ffp-contract=off`, so it cannot fuse a multiply and an add. The median of an
even count is `(a + b) / 2` of the two middle values, which is how `np.median`
takes it. The test compares the two paths bit for bit on random planes of all
four Bayer layouts and Fujifilm's X-Trans, at sizes from 2 to 89 pixels, with
random band heights and thread counts.

## What it bought

On four cores the residual went from 0.81 s to 0.11 s and the block medians from
0.42 s to 0.08 s. Across the 14 largest public sample raws:

| | main | now |
|---|---|---|
| outputs identical to main's | | 14 of 14 |
| time noise-aware adds over directional, median | 0.124 s/MP | 0.085 s/MP |
| noise-aware's time over directional's, median | 2.05x | 1.77x |
| peak memory added | | unchanged |

## What it did not buy

Noise-aware still takes 1.77 times as long as the plain demosaic, about 2 to
3 s more on a 24 to 36 MP frame, so it is still not the default. Most of what is
left is the blend itself, and that step is harder to copy exactly. Its brightness
step goes through a BLAS matrix-vector product, and a C loop would not add in the
same order. Moving it would need a quality check of its own rather than a
same-bytes test.

The run had meant to work on something else: a case where the blend loses detail
on near-clean frames. The frames that show it come from raw.pixls.us, which this
session's network policy refused. The 46 GitHub-hosted sample raws never show the
loss (their worst near-clean tile is 0.02 dB), so that item waits for a frame that
does. The full table is in
[the eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/noise-aware-native-spread-2026-11-19.md).
