---
title: "A logo sampled 7.5 million times: hoisting a point-in-polygon test out of the inner loop"
seo_title: "Faster point-in-polygon rasterising, same pixels"
date: 2026-11-19
description: "Our site build tested every logo subsample against a polygon from scratch. One crossing list per row halved the cost; all 9,275 PNGs stayed byte-identical."
topic: infrastructure
tags: [performance, profiling, nodejs, rasterization, static-site]
---

# A logo sampled 7.5 million times

Every build of this site draws its logo without any graphics library: an
eight-point compass star inside a brass ring on a navy disc. It appears in the
app icons, the favicon and every share card. It is rasterised in plain
JavaScript at 4x4 supersampling. For each subsample, the code asked "is this
point inside the star?" with the classic even-odd test, walking all 16 edges
of each star polygon.

A profile of one of our site-builder tests put that function at the top of
the JavaScript self time: **1.3 seconds**, all spent drawing four app icons,
three favicon sizes and one site card: 7.5 million subsamples per build process.

## The fix: one crossing list per row

The even-odd test looks at each edge, asks whether the horizontal line through
the point crosses it, and if so whether the crossing is to the right of the
point:

```js
if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
```

Only the last comparison involves `u`. The crossing x depends on `v` alone, and
with 4x4 supersampling every sample in a pixel row shares one of four `v`
values. So we compute each row's crossings once and count, for each sample,
how many lie to its right.

It is the same expression evaluated on the same numbers, followed by the same
comparison. The result is not "close". It is the same bits.

## Proving the same bits

A speed-up only counts if the output is unchanged, so we checked it three ways:

- A new test keeps the old per-sample walk and requires identical bytes from
  the new drawing code on 44 canvases: whole and fractional offsets, RGB and
  RGBA, with and without the disc behind the star. If the comparison is
  nudged by 0.0001, it fails.
- Two full cold builds of the site, old code and new, compared file by file.
  34,162 files matched, including 9,275 PNGs. The only difference was the
  build timestamp.
- A hashed bench of nine icon sizes gave the same sha256 both ways.

## What it bought

The icons, favicon and site card now take 1.1 to 1.3 seconds instead of 2.0
to 2.1 seconds. That saves about 0.85 s of CPU in every process that draws
them from scratch, which includes local builds and the test processes that
build the site cold.

The whole cold build did not get measurably faster: 140.6 s before and
141.7 s after. Share cards are drawn in worker processes, and the logo is a
small part of each card. In CI, where the icons come from a disk cache, the
saving is about a tenth of a second. It is a small win, and we report it as
one.

## Two other tries we threw away

Before this, we tried two exact speed-ups in the garment drape simulator's
collision step: an allocation-free body-section lookup and a bounding-radius
early exit. Neither changed the timing. V8 had already optimised the
allocations away, and a T-shirt hangs too close to the body for the bound to
skip much. Both were reverted. Measuring first is how you find out that the
obvious fix does nothing.

The full write-up, with the ranked list of what is left, is in
[`docs/history/pages-build-perf-2026-11-19-mark-row-crossings.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/pages-build-perf-2026-11-19-mark-row-crossings.md).
