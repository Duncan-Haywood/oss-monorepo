---
title: "Making a learned demosaic twice as fast without changing a single output bit"
seo_title: "A learned demosaic made 2x faster, bit for bit, in C"
date: 2026-11-16
description: "We fused a learned Bayer demosaic's 30 feature passes into one row pipeline. It runs 1.8-2.2x faster and matches the numpy reference bit for bit on seven raws."
tags: [photo-editing, raw, demosaic, performance, c]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. This morning it gained an opt-in demosaic that picks a weight for each pixel from a small fitted model. On ten raw files it never saw, it beat our default on colour and luma on every one. It was also slow. Ported to C earlier today it matched the numpy reference bit for bit, but still took 2.6-3.3 times as long as the default demosaic. This post covers the next step: making it faster without letting a single output bit move.

## Where the time went

The model reads eight features per pixel. Each is a ratio of sums over a 3 x 3 or 5 x 5 window. The first C version followed the numpy code step for step: about 30 passes over the whole band, writing 15 band-sized float planes. It read every neighbour through a lookup table that holds edge reads inside the frame. Two things made that slow:

- **None of it vectorized.** Table-indexed reads, and pointers the compiler could not prove were separate, kept GCC on scalar code.
- **Fresh memory for every band.** Each 128-row band asked for about 47 MB. That is above glibc's 32 MB limit for reusing memory, so every band got brand-new pages from the kernel, zeroed and faulted in one at a time.

## What changed

The features now come out of a three-stage pipeline that moves down the frame one row at a time:

1. compute row k's per-pixel inputs from the raw data, plus the horizontal half of each window sum;
2. compute row k-1's second differences, which need the rows on either side;
3. finish the vertical half of all twelve window sums for row k-3, then its eight features and its weight.

Every intermediate lives in an 8-row ring buffer, about 3.5 MB in all, so it stays in cache. Only the final weight plane is written to memory. The inner loops index their neighbours directly. Only the two columns at each edge still go through the clamping table. The row functions take `restrict` pointers, and the library builds at `-O3`.

## Why the bits do not move

The numpy code is the reference, so we needed equality, not "close enough". Three things keep the output exact:

- **Vectorizing does not reorder anything.** With no `-ffast-math`, each vector lane does the same float32 operations in the same order a scalar loop would. `-ffp-contract=off` stops the compiler turning `a * b + c` into a fused multiply-add, which rounds differently.
- **Shared sums are reused, never re-associated.** Numpy's box sum adds `a + (a[-1] + a[+1]) + (a[-2] + a[+2])`. So the 5 x 5 row sum is exactly the 3 x 3 row sum plus `(a[-2] + a[+2])`. Reusing it repeats the same additions.
- **The model is summed in its original order.** We add the 45 terms one at a time over a whole row, in the order the numpy code adds them for each pixel.

## The numbers

These are seven real raw files from a public sample collection: Canon 70D and 7D, Nikon D810, Sony A7 III and A7 IV, Olympus E-M10 and Pentax K-1 II. All seven outputs equal numpy's bit for bit, with a largest difference of 0.0.

- Against this morning's C path, on the same machine in the same hour: 1.8-1.9x faster on four cores and 2.1-2.2x on one. The A7 III went from 1.35 s to 0.73 s and the K-1 II from 2.43 s to 1.31 s.
- It now costs 1.5-2.0x the default demosaic's time, down from 2.6-3.3x.
- It runs 3.9-4.7x faster than numpy, and faster than LibRaw's single-threaded AHD on every frame. That comparison is only a yardstick, because LibRaw's time includes its colour and output steps.

Speed is no longer why the learned weight is opt-in. It still loses to the default on our synthetic test sheet of near-Nyquist detail. Training on noisier, finer frames is the next experiment. The full note, with every row and the command to reproduce it, is `ventures/photo-editing/eval/bayer-learned-fused-2026-11-16.md`.
