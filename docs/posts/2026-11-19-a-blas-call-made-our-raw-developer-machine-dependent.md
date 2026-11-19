---
title: "One BLAS call made our raw developer's last bits depend on the CPU"
seo_title: "A BLAS call made our raw developer CPU-dependent"
date: 2026-11-19
tags: [photo-editing, raw, performance, c, numpy, reproducibility]
description: "Moving ShootFlow's noise-aware blend to C meant replacing a numpy matrix product whose fused multiply-adds varied by machine. Same bytes, 43% less added time."
---

[ShootFlow](https://marisstella.app/photo-editing/) develops camera raw files on
your own machine. Its `--demosaic noise-aware` mode builds two images of every
frame, a sharp directional one and a smooth bilinear one, and blends them block
by block: sharp where the detail is louder than the sensor noise, smooth where
the "detail" is mostly noise. This morning the noise reading moved to C
([the earlier post](2026-11-19-same-bytes-a-third-less-time-noise-reading-in-c.md)).
This afternoon the blend and the bilinear image followed.

## The part that was not a straight port

Most of the work was the usual rule for these helpers: write the C so it does
numpy's arithmetic in numpy's order, compile it with `-ffp-contract=off` so the
compiler fuses no multiply into an add, and test it bit for bit against numpy.

One line did not fit that rule. The blend takes its brightness (luma) from a
second, gentler ramp, and computes the luma of the difference between the two
images as

```python
dy = (d - b) @ LUMA_WEIGHTS   # Rec. 709: 0.2126, 0.7152, 0.0722
```

That `@` is a matrix-vector product, and numpy hands it to BLAS. OpenBLAS's
kernels for modern x86 use fused multiply-adds, in an order of their own. On
random data its answer differs from the plain
`(x0 * 0.2126 + x1 * 0.7152) + x2 * 0.0722` in 23% of values. The gap is tiny,
at most 1.8e-15, but it is not one fixed answer: a different BLAS build or a
different CPU can give different last bits for the same raw file.

So C could not copy it, and in a sense nothing could. We changed the numpy
reference to the plain elementwise order, which gives the same bits on every
machine, and C copies that. Then we checked what the change cost: on the 14
largest public sample raws, not one output byte moved. The float32 store and
the 16-bit encode absorb a last-bit difference. The product is now
reproducible across machines, which it quietly was not before.

## What it bought

Measured on those 14 files (12 to 36 megapixels: Nikon, Pentax, Sony, Samsung,
Fujifilm X-Trans, Leica and a phone DNG), main and the new code run one file at
a time, alternating, on four cores:

- **Same bytes:** 14 of 14 outputs identical (SHA-256 of the 16-bit image).
- **Time:** what noise-aware adds over the plain directional demosaic fell by a
  median 43%, from 0.094 to 0.053 seconds per megapixel. Noise-aware now takes
  1.46x directional's time, down from 1.74x this morning and about 2x
  yesterday.
- **Memory:** the peak it adds fell by a median 16%. The old bilinear image
  built two padded full-frame copies (a float64 plane and an integer mask);
  the C version reads the frame in place. The final clip also moved into the
  blend's own pass, so the result is walked once, not twice.

On a 24 MP plane alone, the bilinear image went from 0.45 s to 0.10 s and the
blend from 0.71 s to 0.11 s.

## What is left

Noise-aware is still 1-2 seconds slower than directional on a large frame, so
the automatic choice still picks directional. Most of what remains is the noise
read itself on raws that carry no noise profile (a patch-PCA estimate, about
0.8 s on 24 MP). That is next. The measurements, the table and the commands to
reproduce them are in
`ventures/photo-editing/eval/noise-aware-native-blend-2026-11-19.md`.

ShootFlow is MIT licensed and runs on your own computer; nothing is uploaded.
Its develop output is an estimate of what the sensor saw, not a reference
render from any camera maker.
