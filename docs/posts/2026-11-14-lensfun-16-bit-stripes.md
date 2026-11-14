---
title: "Lensfun's 16-bit vignetting draws stripes every four pixels"
seo_title: "lensfun SSE2 vignetting: 4-pixel stripes on 40,730 cases"
date: 2026-11-14
tags: [photo-editing, ventures, raw, lensfun]
description: "We ran lensfun 0.3.4's float and 16-bit vignetting code through ctypes. Its 16-bit SSE2 loop draws 4-pixel stripes and breaks each row's end."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) develops raw photos on your own machine. It brightens dark lens corners using [lensfun](https://lensfun.github.io/)'s open database of lens measurements. [Yesterday](2026-11-13-two-lensfuns-two-corners.md) we checked that correction against lensfun's compiled code: 97,382 cases, a median gap of about one part in a million.

That check had a blind spot. We reached lensfun through its Python package, lensfunpy, which only accepts three-channel images. Lensfun itself picks its vignetting code, a plain loop or an SSE or SSE2 one, from the pixel type, the number of channels per pixel, and whether the image buffer starts on a 16-byte boundary. With three channels you always get the plain one. darktable passes four channels, so it gets a different routine. So "ShootFlow matches lensfun" only covered the plain loop.

## Calling the library directly

lensfunpy ships the compiled library alongside itself. We loaded it with Python's `ctypes` and called lensfun's C functions directly. That let us hand it four-channel rows (red, green, blue and an "unknown" fourth channel, lensfun's own RGBA example). We placed each row either on a 16-byte boundary, which triggers the fast SIMD routine, or one sample past it, which sends the same pixels down the plain loop. Then we ran every measured setting of 474 lenses on flat test images at two widths: 40,730 cases at each.

| lensfun 0.3.4 routine | what came back |
|---|---|
| float, 4 channels (SSE) | the plain loop's gains to float rounding, **but the alpha channel is multiplied too**, by up to 6.9x |
| 16-bit, plain | the gain is cut to whole 1/1024ths: up to 1/1024 dark, half that on average |
| 16-bit, 4 channels (SSE2), 1,202 px wide | 4-pixel stripes: p99 4.2%, worst 25% |
| the same, 6,002 px wide | p99 0.9%, worst 7% |
| SSE2, last `width % 4` pixels of each row | wrong in every case |

## Two bugs in one loop

The SSE2 routine handles four pixels at a time. To save work, it tracks each pixel's squared distance from the image centre as a running total. It adds a step to the total each time it moves four pixels along the row. The step it adds is right for the first of the four pixels and too small for the other three. So pixel 2 of each group falls a little behind, pixel 3 more, pixel 4 more again, and the gap grows toward the right edge. The result is faint columns that repeat every four pixels. The error per group is fixed, so it adds up over fewer groups in a wider image: the 99th percentile drops from 4.2% at 1,202 pixels to 0.9% at 6,002.

The second bug is at the end of each row. When the width isn't a multiple of four, the leftover one to three pixels go to the plain loop. The code advances their position by the number of groups it has processed. But it adds that count in the wrong units: the position is measured in lens radii, not pixels. It also moves the row number, which shouldn't change at all. So those pixels are corrected as if they sat hundreds of radii outside the frame, and they come out black or blown.

We wrote that loop out in numpy, both bugs included. It matches the library on every case we sampled, to within the small error lensfun's fast approximate reciprocal allows. With both bugs fixed, the same loop is within 0.12% of the true gain, and all of that comes from the 1/1024 rounding. Lensfun's development branch still has the same loop. We found no existing report of either bug in lensfun's issue tracker.

## What this means if you compare corners

ShootFlow does its vignetting in 64-bit floating point and rounds once, when it writes the 16-bit master. So it agrees with lensfun's floating-point routines. If you compare it with a program that runs lensfun in 16 bits, expect ShootFlow to be about 0.05% brighter. If that program passes 16-bit RGBA, expect stripes and a bad last column on lensfun's side. Those differences are lensfun's, and this check is the evidence.

The numbers are in [`eval/lensfun-vignetting-paths-2026-11-14.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/lensfun-vignetting-paths-2026-11-14.md). `tools/lensfun_vignetting_paths_check.py` reruns the whole check in under a minute on four cores after `pip install lensfunpy numpy`.
