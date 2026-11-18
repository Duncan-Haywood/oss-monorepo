---
title: "The same demosaic, bit for bit, five times faster"
seo_title: "A directional Bayer demosaic in C: bit-identical to numpy, 4-5x faster"
date: 2026-11-15
description: "ShootFlow's directional Bayer demosaic now runs in C: equal to the numpy version bit for bit on five real raw files, 4.2-4.9x faster, 0.44 s for 24 MP."
tags: [photo-editing, raw, demosaic, performance]
---

Earlier today ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, switched every Bayer raw file (nearly every camera: Canon, Nikon, Sony, Olympus, Panasonic, Samsung, Pentax, and DNGs) from a bilinear demosaic to a directional one. It gave better colour on every test frame and less false colour along edges. It was also slow: 1.8 to 3 seconds a frame on four cores, against about 1 second for LibRaw's AHD. On a 600-frame wedding that adds up to more than half an hour.

## What changed

The numpy version builds about seventy full-size temporary arrays per band of rows, so most of its time goes to moving memory. The new version, `src/shootflow/bayer_native.py`, does the same steps as one C function per band. It is built with the computer's own C compiler the first time it is needed and loaded through Python's `ctypes`, the same way ShootFlow's raw decoders already work. With no compiler, the numpy version runs as before.

The C code follows the numpy code's float32 arithmetic in the same order, and it is compiled so the compiler cannot fuse a multiply and an add into one step (that would change the last bit). Edge pixels are handled the same way too, through two small lookup tables instead of a branch on every read.

## The numbers

On five real raw files (a Canon 70D, Nikon D810, Sony A7 III, Olympus E-M10 and Pentax K-1 Mark II, from a public sample set), best of two runs on four cores:

| camera | numpy | C | faster by |
|---|---|---|---|
| Canon 70D (20 MP) | 1.70 s | 0.41 s | 4.2x |
| Nikon D810 (36 MP) | 2.99 s | 0.71 s | 4.2x |
| Sony A7 III (24 MP) | 2.13 s | 0.44 s | 4.9x |
| Olympus E-M10 (16 MP) | 1.42 s | 0.30 s | 4.8x |
| Pentax K-1 II (36 MP) | 3.02 s | 0.62 s | 4.9x |

The output equals the numpy version's on every pixel of all five frames, with a largest difference of exactly 0. So the quality measurements from this morning still apply to the faster path: nothing was re-tuned, and nothing changed except the time.

For scale, LibRaw's AHD took 0.8 to 1.9 s on the same files. That figure is single-threaded and includes LibRaw's colour steps, so the comparison is rough. On one thread ours is still 1.4 to 1.7 times slower than LibRaw's whole pipeline, which is the next thing to work on if speed matters more.

## What's left

The optional median clean-up (off by default) still runs only in numpy. The X-Trans demosaic for Fujifilm sensors has no C path yet, and the same approach should work for it. The full write-up, with the checking script and raw rows, is in `ventures/photo-editing/eval/bayer-native-2026-11-15.md`.
