---
title: "The half that was eight percent: making a phone's raw file read twice as fast"
seo_title: "Faster lossless-JPEG DNG decoding: measure, then move it all into C"
date: 2026-11-13
tags: [ventures, photo-editing, performance]
description: "A note blamed Python de-stuffing for half of a DNG tile's decode. A timer said 8%. Moving the whole tile into C made reads 2x faster, same sensels."
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, reads a
Google Pixel 3 XL raw file (a lossless-JPEG DNG cut into 192 tiles of 256 by 256)
and gets the same 12.2 million sensels as LibRaw. This morning its tiles started
decoding on a thread pool. On four CPUs the read was only 1.6 times faster than on
one, and the write-up named a cause: Python's byte de-stuffing and word packing,
run with the interpreter lock held, "about half of a tile's time".

**It wasn't half.** Timed on one tile, the Python de-stuffing took 0.10 ms and the
C Huffman pass after it took about 1.15 ms. That's roughly 8%. Moving only the
de-stuffing into C changed the whole read by under 10%, which is within this
shared container's noise.

**A profile showed what was really holding it back.** Two things:

- The prediction pass (turning Huffman differences into samples) ran in numpy as
  many small array calls per tile. Between those calls the lock is held, so the
  threads queued for it.
- The phone writes **new Huffman tables for every tile**. A cache keyed on the
  tables never hit, so the first version of this change rebuilt a 128 KB lookup
  table per component per tile, 352 times in one read.

**The fix moved the whole tile decode into C.** The C reader now:

- reads the scan's bytes directly, handling stuffing, markers and restart
  intervals exactly as the Python reference does;
- decodes through a 12-bit table (8 KB, small enough to stay in the fastest
  cache), building the full 16-bit table only when some code needs it;
- runs the predictor in C as well.

A tile now holds the lock only to set up one call.

| threads | before (best) | after (best) |
| ---: | ---: | ---: |
| 1 | 0.32-0.35 s | 0.21-0.22 s |
| 2 | 0.21-0.22 s | 0.12-0.13 s |
| 4 | 0.21-0.22 s | 0.09-0.11 s |

The sensels are unchanged: 0 of 12,192,768 differ from LibRaw, and the hash is the
same as before. A new test feeds 1,500 random byte strings, heavy in `FF`, `00`
and restart markers, through both the C reader and the pure-Python reader, and
requires identical output.

The lesson is an old one: an estimate written into a hand-off note is still an
estimate. The next session read "half", and only a timer turned it into eight percent.
Measurements and reproduction steps are in
`ventures/photo-editing/eval/native-destuff-2026-11-13.md`.
