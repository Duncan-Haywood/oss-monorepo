---
title: "Fujifilm X-Trans demosaic in C, and why numpy's x ** 4 differs between machines"
seo_title: "X-Trans demosaic in C, bit-identical to numpy, 4x faster"
date: 2026-11-15
description: "ShootFlow's X-Trans demosaic now runs in C, equal to numpy bit for bit on two real Fujifilm frames and 4x faster. Matching it meant replacing a float32 power."
tags: [photo-editing, raw, demosaic, performance, numpy]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, reads Fujifilm RAF files itself, including the X-Trans sensors with their 6x6 colour layout. Since yesterday it turns them into full-colour images with a directional demosaic: green is built four times, each along one direction, and the four results are blended by how smooth each one is along its own line. On known-truth tests it ends 0.5 to 0.7 dB behind LibRaw's three-pass method. But with numpy it took about 5 seconds for a 16-megapixel frame on four cores, twice LibRaw's time.

## What changed

`src/shootflow/xtrans_native.py` now runs the whole demosaic for one band of rows as a single C function. It is built with the computer's C compiler the first time it is needed and loaded through `ctypes`. With no compiler, the numpy version runs as before. The numpy code stays the reference, and the C code has to match it exactly, not just come close.

On the two real X-Trans files in a public sample set (an X-E1 and an X-E2), best of two runs on four cores:

| frame | numpy | C | LibRaw three-pass (one thread) |
|---|---|---|---|
| X-E1, 16 MP | 5.01 s | 1.29 s | 2.51 s |
| X-E2, 16 MP | 4.97 s | 1.26 s | 2.52 s |

Both outputs match numpy bit for bit (largest difference 0.0), so every quality number measured for the numpy version still holds.

## Matching numpy exactly took one change to numpy's side

The blend weights each direction by `(D_min / D) ** 4`. My first C version used `powf` from the C maths library and didn't match. On this machine numpy's float32 power goes through the CPU's vector maths routines (AVX-512 here). Those routines give a different last bit from libm's `powf` on 41,436 of 200,000 random inputs, and numpy's own one-at-a-time path disagreed with its array path too. So the numpy result depended on which CPU ran it.

Both versions now compute the fourth power as `(q * q) * (q * q)`. Plain multiplication is exact IEEE arithmetic, so it gives the same bits on every machine, in Python and in C. On the real frames the change moves a fifth of the output values by at most 3e-7 of full scale, which is 0.02 of a 16-bit step.

A few other things also had to match numpy exactly:

- **Edge reads.** Every read past the edge reflects the way `np.pad(mode="reflect")` does.
- **Number types.** numpy computes one estimate in double precision, because an integer array times a float32 array becomes float64 there. The C code does the same.
- **Order of additions.** The 3x3 sums add columns of three and then rows of three, in numpy's order.
- **Empty windows.** When a 3x3 window holds no sensel of a colour, numpy falls back to a wider average. The tests include a made-up sparse layout, found by search, that forces that path.

## Where the time went

The first C version was only 1.3 times faster than numpy. Timing one band with a small C test program showed why: the median clean-up at the end took 40% of the time. Its sorting network ran as a loop over a table with branches, and the compiler would not vectorise it. Unrolled and written with 4-lane vector types (portable across GCC and clang, SSE or NEON), it became six times faster. Fusing the masked 3x3 averages into one pass, and taking edge columns out of the inner loops, brought a band from 0.52 s to 0.21 s.

## Not done

On one thread ours still takes 1.8 times as long as LibRaw's three-pass: 26 full-band working planes are a lot of memory traffic. About 0.5 s of the 4.4 s on one thread is numpy work around the C call that could move into C too. The full write-up, with the commands to repeat it, is `ventures/photo-editing/eval/xtrans-native-2026-11-15.md`.
