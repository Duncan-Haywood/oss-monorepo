---
title: "ShootFlow's DNG developer runs 20 times faster with numpy, and writes the same bytes"
seo_title: "Develop DNG raw files 20x faster in Python with numpy, same output"
date: 2026-11-10
tags: [photography, raw, dng, python, numpy, performance, open-source]
description: "An optional numpy engine takes ShootFlow's DNG develop from 31 s to 1.5 s on a real 12 MP Nikon frame, byte-identical to the pure-Python path."
---

ShootFlow develops DNG raw files from their sensor data, and that developer is checked
against LibRaw pixel by pixel. It was also slow. It is written in plain Python with no
dependencies, so a 12 MP frame took about half a minute and a 21 MP one about a minute.
At that rate a 500-frame shoot takes hours.

ShootFlow now has an optional numpy engine. If numpy is installed it is used, and if not,
nothing changes. On the same real camera files as before:

| frame | pure Python | numpy | output |
|---|---|---|---|
| Nikon, 12 MP, full size | 31.0 s | 1.5 s | byte-identical |
| Nikon, half size | 8.8 s | 0.56 s | byte-identical |
| Canon 5D Mark II, 21 MP, full size | 54.2 s | 2.6 s | byte-identical |
| Canon, half size | 15.6 s | 1.1 s | byte-identical |

The overnight pipeline on a card holding the Nikon frame and a short clip went from 74.5
seconds to 7.5. That run covers ingest, develop, grade, proxies, scores, reels and the
carousel.

## Same bytes, not close

Most speed-ups like this change the output slightly, and then everything checked against
the old output has to be checked again. We didn't want that. The developer's agreement with
LibRaw (within one 8-bit step at every pixel on both cameras) was measured on the pure-Python
code, so the fast code has to write exactly what the pure code writes.

So the numpy engine does every floating-point step in the same order. Black is subtracted
before the row and column offsets, as in the original loop. Each missing colour sums its
neighbours in the same order, and a neighbour outside the image adds +0.0, which leaves any
sum unchanged. The colour matrix multiplies and adds in the same sequence. numpy's add and
multiply each round once, the way Python's float arithmetic does, with no fused
multiply-add, so every sample comes out equal.

The checks:

- `tools/develop_engine_check.py` develops each real file with both engines and compares the
  output byte for byte. All four cases above match.
- `tests/test_raw_develop_engines.py` does the same on synthetic DNGs with noise added, so the
  clamps at black and at the clip level both fire. It covers every Bayer phase, odd sizes and
  2x2, per-position black levels, row and column black offsets, a linearization table, cropping,
  all eight orientations, exposure, white balance and LinearRaw.
- Rerunning the LibRaw comparison with the numpy engine gives the same numbers to the third
  decimal, as identical bytes should.

We also broke the engine on purpose to make sure the tests notice. Rounding the curve lookup
slightly differently failed 50 checks, and swapping two orientations failed 2. A change in the
last bits of a float changed no 16-bit output on these scenes. So the tests prove the outputs
match, and that the order is kept is something you check by reading the code.

## What is still slow

The developer is fast now, but reading the file is still pure Python: 0.8 s for the Nikon
and 2.3 s for the Canon. That's fine for uncompressed DNGs. Most cameras and Adobe's converter
write lossless-JPEG DNGs, and that decoder walks the bit stream one code at a time. We haven't
measured it on a camera-written file, because none could be downloaded from the build
container. That is the next thing to time.

To use it: `pip install numpy`, then `shootflow develop FILE.dng --out DIR`. Use `--engine
python` to force the stdlib path. Details are in
`ventures/photo-editing/eval/develop-numpy-engine-2026-11-10.md`. ShootFlow is MIT licensed,
and the results are measurements on two test files from rawpy's repository, not a promise
about every camera.
