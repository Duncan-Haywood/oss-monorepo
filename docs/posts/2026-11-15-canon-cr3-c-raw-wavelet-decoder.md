---
title: "Canon C-RAW decoded: a 5/3 wavelet, a QP grid and every sensel equal to LibRaw's"
seo_title: "Canon CR3 C-RAW decoder in Python and C matches LibRaw exactly"
date: 2026-11-15
tags: [photo-editing, shootflow, raw, canon, cr3, c-raw, wavelet, image-processing]
description: "ShootFlow now reads Canon C-RAW directly: on three real files from an EOS R8 and an EOS R3, every sensor value equals LibRaw's, in under a second."
---

This morning ShootFlow, the open-source photo pipeline in this repository, learned to read Canon CR3
files shot at full "RAW" quality ([the earlier post](2026-11-15-canon-cr3-read-sensel-for-sensel.md)).
It still refused the other quality Canon offers, C-RAW, and sent those files to Adobe's DNG Converter.
That covered most of the real CR3s at hand: three of the five in the public test collection are
C-RAW. C-RAW files are about 40% smaller (17 MB against 37.6 MB for the same EOS R8 frame), so
people who shoot a lot use them.

They are read directly now:

    shootflow develop IMG_0041.CR3 --dcp "Canon EOS R8 Adobe Standard.dcp"

## What C-RAW is

Full-quality CR3 codes each of the four Bayer planes line by line: predict each value from its
neighbours and Rice-code the error. C-RAW keeps that coder but codes something else. Each plane first
goes through three levels of a reversible 5/3 wavelet, the integer lifting filter JPEG 2000 uses.
Each level splits the image into a half-size low band and three detail bands (HL, LH, HH). The detail
bands are then quantised: divided by a step and rounded, which is where the space is saved and where
it stops being lossless.

The steps come from a grid of QP values stored at the start of the tile: one per 8 plane columns and
2 rows, Golomb-coded with the same median predictor as the image. Each level averages the grid down
to its own scale, a QP becomes a step through a six-entry table that doubles every six, and each
subband header adds a multiplier and a base. On these files the deepest low band has step 1, the
middle levels a multiplier of 4 and the finest 8, or 16 for HH. Detail is quantised hardest where the
eye notices it least.

The deepest low band is coded exactly like a full-quality plane. The detail bands use a different
coder that does not predict values at all, because a high-pass coefficient is already close to zero.
It runs a run of zeros wherever the left, above and above-right coefficients are zero. A value right
after a run is coded one step toward zero, since it cannot be zero. The Rice parameter also follows
the parameter used in the column above, so it tracks vertical edges.

## Checked against LibRaw

The decoder is written from the format as LibRaw's `crx.cpp` reads it (Alexey Danilchenko's
reverse-engineered decoder). It is an independent implementation: no code was copied. LibRaw runs
the inverse wavelet as a streaming state machine, a few lines at a time. ShootFlow decodes each
subband whole, then inverts one level at a time with plain lifting steps. That is simpler and gives the
same integers.

On the three C-RAW files (two EOS R8, one EOS R3), every sensel equals LibRaw 0.22's: 76.7 million
values, with both the pure-Python reference and the C path. The white balance, white level and CFA
match too. The first full decode matched at every sensel. Unlike this morning's full-quality reader,
no detail had to be found by brute force: the run-mode subtlety found then is shared code.

Developed at half size against LibRaw's render, the R3 frame differs by a median of 0.24 of an 8-bit
step. That frame was shot near daylight, where the two colour models agree. The R8 frame keeps the
2.3-step gap the full-quality R8 files showed. It was shot under tungsten light, and that gap comes
from the colour model, not the data. The data is equal sensel for sensel.

## Speed

Pure Python reads a 25.5 MP C-RAW in 25 to 28 seconds. The C path decodes each plane on its own
thread and takes 0.6 to 0.7 seconds a file, close to the full-quality setting's 0.5 seconds.

## What's next

Very wide sensors (the R5 at 8,192 columns) may store two tiles side by side. Tiles add extra
coefficients at the seams, and no tiled test file is at hand, so a tiled CR3 is refused with a
pointer to the DNG Converter. The measurements, tests and reproduction steps are in
`ventures/photo-editing/eval/canon-cr3-craw-2026-11-15.md`.
