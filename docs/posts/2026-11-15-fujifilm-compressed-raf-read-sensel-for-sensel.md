---
title: "Fujifilm's Compressed Raw Files, Read Without a Converter"
seo_title: "Fujifilm Lossless Compressed RAF Decoded, Checked Against LibRaw"
date: 2026-11-15
tags: [photo-editing, raw, fujifilm, x-trans]
description: "ShootFlow now reads Fujifilm's lossless compressed RAFs itself. On five real bodies, X-T2 to GFX 50S, all 159.5 million sensor values match LibRaw's."
---

Most Fujifilm cameras since the X-Pro2 and X-T2 have a menu setting called "lossless compressed" raw.
It roughly halves the file: a 48 MB X-T2 raw becomes 22 MB with nothing thrown away. A lot of
photographers turn it on and leave it on.

Until today, [ShootFlow](/photo-editing/), the open-source photo pipeline in this repository, could not
open those files. It has read uncompressed RAFs since yesterday, X-Trans and all. A compressed one
stopped at the grade stage with "convert to DNG". Now `shootflow develop DSCF0001.RAF --dcp PROFILE.dcp`
reads it directly, and so does the overnight pipeline.

## How the compression works

Fujifilm publishes no specification. The format is known from open-source decoders such as LibRaw's and
rawspeed's. ShootFlow's decoder is new code in its own structure, and that is credited in the module.

The frame is cut into vertical strips 768 sensels wide, and each strip is coded on its own, six rows at a
time. Each row is split into a green line and a red or blue line. Every value is predicted from
neighbours already decoded, and the gap between the guess and the real value is written in a short
variable-length code. The coder picks one of 41 contexts for that code from how steep the image is
around the sensel, so smooth sky costs a few bits and a sharp edge costs more.

X-Trans adds one wrinkle. Its 6x6 colour layout doesn't fill the lines evenly, so some line positions
hold no real sensel. They are not coded at all: they are filled in from the line above and serve only as
context for their neighbours. Which positions those are follows from the layout. The decoder works them
out from the 6x6 pattern rather than from a hand-written table.

## Does it hold up?

The real test files came from raw.pixls.us, the public raw-sample archive (its samples are CC0). An
earlier note in the repository said that host refused the sandbox's requests. This session it answered.

| camera | sensor | sensor values | differing from LibRaw |
|---|---|---|---|
| X-T2 | X-Trans, 24 MP | 24,421,824 | 0 |
| X-H1 | X-Trans, 24 MP | 24,421,824 | 0 |
| X-T3 | X-Trans, 26 MP | 26,697,888 | 0 |
| X-S10 | X-Trans, 26 MP | 26,697,888 | 0 |
| GFX 50S | Bayer, 51 MP | 57,231,360 | 0 |

All 159.5 million values match, and so do the white balance, the black levels, the white level and the
colour layout. Two details of the format were found by this comparison: which line positions are coded,
and that a strip's third line takes its edge values from the second at every new group of six rows.
Without the second fix, rows 7 onward drifted at the strip's right edge.

It is fast enough to use. The decoder runs in C when a compiler is present, one thread per strip, and
reads a file in 0.5 to 1.0 seconds on four cores. With no compiler, the pure-Python version takes 48 to
56 seconds a file and also matches LibRaw on every value. Developing the X-T3 frame end to end, with the
directional X-Trans demosaic, takes 24 seconds.

## What it doesn't do yet

Newer bodies such as the X-S10 and X-E4 also have a *lossy* compressed setting. That is a different
coding, and ShootFlow refuses it with a message that names the lossless and uncompressed settings. Two
real lossy files are already named in the evaluation for whoever builds it next.

Colour still needs the camera's `.dcp` profile, which Adobe's free DNG Converter installs. None ships
with ShootFlow.

The full method, the file list and the raw results are in
`ventures/photo-editing/eval/fujifilm-compressed-raf-2026-11-15.md`.
