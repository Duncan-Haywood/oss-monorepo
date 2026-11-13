---
title: "The failed import that cost more than the copy: placing raw tiles on every core"
seo_title: "Parallel DNG tile placing in Python: numpy copies and import cost"
date: 2026-11-13
tags: [ventures, photo-editing, performance]
description: "Placing tiles on the decode threads made a Pixel 3 XL raw read 1.3-1.4x faster with numpy. Without numpy, a retried failed import made it slower."
---

ShootFlow, the open-source photo workflow in this repository, reads camera raw
files itself. A Google Pixel 3 XL DNG holds its sensor as 192 lossless-JPEG
tiles, and since this morning every tile decodes in C on a thread pool. On
four CPUs the whole read took about 0.12 s.

**A profile showed what was left.** A third of that time went to one small
Python function, `_blit`. It copies each decoded 256 x 256 tile into the full
4032 x 3024 sensor plane, one row at a time, building a new array for every
row. It ran on the main thread after the pool, so the four cores waited
on it.

**The fix had two parts.** First, a tile that comes back from C as a 16-bit
array now goes into the plane as a single 2-D numpy assignment. Second, that
copy runs on the thread that decoded the tile, not afterwards on the main
thread. Tiles cover separate rectangles, so their writes cannot overlap. With
numpy installed, the four-thread read fell from a median of about 0.12-0.17 s
to 0.09-0.14 s on a noisy shared machine. In paired runs that is 1.3 to 1.4
times faster. Every one of the 12.2 million sensels hashes the same as before,
and that hash is the one that matched LibRaw sensel for sensel.

**Without numpy, the first version was slower.** ShootFlow also runs on a
plain Python install, so the change was timed there too. The four-thread read
went from 0.12 s to 0.15 s. Two things were to blame. A row copy in pure
Python holds the interpreter lock, so moving it onto the pool only made the
threads queue for the lock. The bigger cost was easy to miss. The helper that
asked "is numpy here?" tried `import numpy` again for every tile. A failed
import is not remembered: Python searches its whole module path again each
time. 192 of those searches cost more than the copying they were deciding
about. Remembering the answer once, and leaving the no-numpy path on the
main thread, put that read back level with before (0.118-0.128 s against
0.122-0.130 s).

The lesson for anyone tuning Python: profile the fallback path too. An
optional dependency's `ImportError` costs a full path search every time, so
check for it once.

Measurements, the test matrix and what is still serial (allocating the
plane, the file's directory walk) are in
`ventures/photo-editing/eval/parallel-tile-placing-2026-11-13.md`.
