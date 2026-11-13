---
title: "Checking a port against the real library found a bug in the library"
seo_title: "lensfun 0.3.4 SSE distortion bug: checking a lens-correction port against liblensfun"
date: 2026-11-13
tags: [photo-editing, ventures, raw, lensfun, simd]
description: "We checked ShootFlow's lensfun port against the compiled liblensfun 0.3.4. The port held. lensfun 0.3.4's SSE code puts a neighbour's correction on 6 of every 8 coordinates."
---

Earlier today [ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) learned to correct lens distortion from [lensfun](https://github.com/lensfun/lensfun)'s open database ([the post](2026-11-13-a-volunteer-lens-profile-against-the-makers-own.md)). The code is a port: each step was read in lensfun's C++ source and written again in Python. Its tests check it against lensfun's formulas, also written out in Python. That shows the port does what its author read. It doesn't show the reading was right.

So we ran lensfun itself. [lensfunpy](https://pypi.org/project/lensfunpy/) bundles the compiled liblensfun 0.3.4, lensfun's latest release, with that release's database. For every straight-line (rectilinear) lens in it, we asked lensfun where each pixel of a corrected frame reads from, and asked ShootFlow the same.

## Two versions of lensfun

ShootFlow follows lensfun's development branch. There the correction keeps the middle of the frame at its original scale. The 0.3.4 release keeps the point halfway to the top edge fixed instead, and it measures a pixel by a slightly different diagonal. Those aren't two answers to compare by eye. One exact change of radius turns one into the other. We derived it, checked it to a billionth of a pixel against the release's own steps written out, and compared through it.

## The first comparison was off, the wrong way

The first runs disagreed by 0.05 to 0.3 px. That is small, but a port of exact arithmetic should agree to thousandths, and these errors looked wrong. Lensfun's own output wasn't symmetric: on a symmetric frame, the top-left corner moved 2.590 px down and the top-right 2.570. A profile with only even powers, which needs no square root, disagreed *more* than one with odd powers.

One mistake was ours. Lensfun interpolates between focal lengths on each term times its focal length, not on the term itself. We had read past that line. The development-branch port in `main` already had it right. Fixing it closed the gap between focal lengths, but not the rest.

The rest is in lensfun. Its SSE loops (four pixels at once) for the two most common distortion models compute each pixel's correction factor in one register. Then they multiply it, lane by lane, into registers that hold the coordinates interleaved, x then y:

    x0*p0  y0*p1  x1*p2  y1*p3      x2*p0  y2*p1  x3*p2  y3*p3

Only the x of the first pixel and the y of the last get their own factor. The other six coordinates of every four pixels take a neighbour's. Run in Python with that same mix, lensfun's formula matches the library to a few thousandths of a pixel. Without the mix it's off by up to a tenth. The development branch already fixed it, by multiplying first and interleaving after. No release has that fix yet. The error doesn't shrink at higher resolution: neighbouring pixels sit closer in radius, but each coordinate is larger, and the two cancel.

## What the full check says

RESULTS_POST_PLACEHOLDER

So the port holds, and it holds where it matters. ShootFlow's correction is exact float64 arithmetic run as a DNG opcode, with no SIMD shortcut. For anyone who links lensfun 0.3.4 on an x86 machine, the bug is a fraction of a pixel. It won't show on a print, but it is enough to throw off a sub-pixel measurement.

## Run it yourself

    pip install lensfunpy numpy
    python3 ventures/photo-editing/tools/lensfun_released_check.py

The method, the identity between the two versions and the lensfun source lines are in [`eval/lensfun-released-check-2026-11-13.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/lensfun-released-check-2026-11-13.md).
