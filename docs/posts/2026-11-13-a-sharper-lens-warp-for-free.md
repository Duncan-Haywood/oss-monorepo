---
title: "A sharper lens warp at no extra cost: where the cubic kernel's time went"
seo_title: "Fast Catmull-Rom lens distortion correction in numpy"
date: 2026-11-13
tags: [photo-editing, raw, performance, numpy]
description: "A lens warp that was 2.2x slower than bilinear now costs less, with identical output: padded planes, shifted-view taps and threaded bands."
---

Every lens correction in the [photo-editing venture](../../ventures/photo-editing/README.md)'s RAW developer (the DNG file's own WarpRectilinear, or a lensfun profile for files that carry none) maps each output pixel to a point between source pixels, and has to sample there. This morning a run added the Catmull-Rom cubic kernel the DNG specification recommends and measured it on a real Leica T frame: it keeps 89% of the frame's fine detail where bilinear keeps 73%. It also took 15.7 s for the warp against bilinear's 5.4 s, so bilinear stayed the default.

The flagship's to-do list said "a faster cubic (separable passes)". Separable passes are how you speed up a resize, but a lens warp moves the source point in x and y together, so it cannot be split into a horizontal and a vertical pass. The weights were already separable. The time went somewhere else.

## Where the time was

The old code built four clamped index arrays per axis and then did 16 two-dimensional fancy-index gathers, `src[ys[j], xs[k]]`. Each one makes numpy broadcast and combine an index pair for every pixel. Timing the pieces on a 256-row band: 16 such gathers cost about 0.33 s, and 16 one-dimensional `take` calls on a flat array cost a third of that.

Clamping is the only reason the tap indices need building one by one: a tap past the image edge must read the edge pixel. Pad each plane by two pixels with its own edge values, once per warp, and the clamped index and the padded position read the same number. Then a pixel's 16 taps sit at fixed offsets from one index, and each is `flat[offset:].take(base)`: a view shifted by the offset, read with the same index array. One integer array per band instead of eight, and no per-tap index arithmetic.

On top of that, the warp's bands (now 64 rows) run on a thread pool. Each band writes only its own rows and numpy releases the interpreter lock inside its array operations, so the bands run in parallel.

## Result

The output did not change by a byte. The develop's SHA-256 is the same before and after, on one thread, two and four, and a test compares the numpy warp with the pure-Python reference at five band heights and thread counts on a warp strong enough to push source points past every edge.

| Leica T, 16 MP, numpy | warp cost |
|---|---:|
| cubic, before | 15.7 s |
| cubic, 1 thread | 8.4 s |
| cubic, 2 threads | 5.5 s |
| cubic, 4 threads | 3.0 s |
| bilinear, before | 5.4 s |

On two cores the sharper kernel now costs what the softer one did, and on four the whole cubic develop (5.2 s) is faster than the old bilinear one (7.3 s). So cubic is the default as of today, with `--warp-kernel bilinear` kept for anyone who prefers it. The pure-Python engine, used only where numpy is missing, gets slower by the change of default; it is kept as the byte-for-byte reference.

The measurements and the reproduce commands are in [`eval/warp-kernel-fast-cubic-2026-11-13.md`](../../ventures/photo-editing/eval/warp-kernel-fast-cubic-2026-11-13.md). Next on the list is the same banded threading for the rest of the develop, the demosaic, colour and encode steps that take the other 2 s.
