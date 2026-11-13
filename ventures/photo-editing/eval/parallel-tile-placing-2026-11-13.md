# Raw tiles placed on the decode threads (2026-11-13)

## Why

The flagship's speed item (`portfolio/flagships.yaml`, photo-editing), left by
`eval/native-destuff-2026-11-13.md`: once the whole lossless-JPEG tile decode ran in C on a thread
pool, what stayed serial in `parse_raw` was `_blit`, placing each decoded tile into the full
sensor plane, "about 0.06 s".

## What the measurement said first

`parse_raw` on the Pixel 3 XL `pixel3.dng` (MIT, tinydng repository, downloaded at check time;
4032 x 3024, 192 tiles of 256 x 256), profiled on this container (4 CPUs, shared host) before the
change: with 4 threads `_blit` took 0.041 s of a 0.144 s profiled read, a third of it, all on the
calling thread while the pool's results were waited on. With 1 thread it was 0.046 s of 0.29 s.
Each tile came back from the C predictor as an `array('H')` and `_blit` rebuilt every one of its
256 rows with `array(typecode, slice)`.

## What changed (`src/shootflow/raw_develop.py`)

1. `_blit` copies a chunk that is already an `array` of the plane's own type as **one 2-D numpy
   assignment** (a view of the plane, a view of the tile, edge tiles clipped) when numpy is
   installed, else as array-to-array row slices (about twice as fast as the old per-row
   `array(...)`, measured in isolation: 192 tiles 0.0056 s against 0.0097-0.0122 s). A plain list
   (the pure-Python decoders) still goes through `array(...)` per row, which keeps refusing a value
   too big for the plane (`OverflowError`).
2. `_decode_chunks(..., sink=)` hands each chunk to `sink(i, samples)` **on the thread that decoded
   it**. `parse_raw` passes the tile (or strip) placer through `_place_chunks`, so placing is no
   longer a serial step after the pool. Every chunk writes its own rectangle of the plane, so the
   writes never overlap; an error still raises as before (the plane is then discarded).
3. Without numpy (or with `SHOOTFLOW_NATIVE=0`, the pure reference path) the chunks are placed on
   the calling thread in file order, as before: the row-slice copy holds the GIL, and moving it onto
   the pool measured slower (4 threads, median 0.15-0.16 s against 0.12 s).
4. `_blit_numpy()` tries `import numpy` once. The first version retried it per tile; on a Python
   without numpy a failed import searches `sys.path` every time, and 192 of them cost more than the
   copy, which is what made the no-numpy read slower in the first measurement.

## Same samples

- Pixel 3 XL: SHA-256 of the sensels `7304e29f5ddae78c` (first 16 hex) before and after, at 1, 2 and
  4 threads, with and without numpy (Python 3.13 with numpy 2.5.3; Python 3.11 without numpy).
  That is the hash `eval/native-destuff-2026-11-13.md` recorded when the sensels were checked
  against LibRaw 0.22.2 (0 of 12,192,768 differ).
- `tests/test_raw_develop.py`, `TilePlacingTests`: the numpy, array-slice and list paths place the
  same samples for 16- and 32-bit planes, one and three samples a pixel, with clipped edge tiles
  (23 x 13 plane, 8 x 5 tiles); a list value over 65,535 is refused; a tiled lossless-JPEG DNG reads
  the same sensor at 1 and 4 threads with numpy on and off.

## Time

`parse_raw` on the Pixel file, 10 repetitions per cell, old (`main` at 9a70aaf1) and new
alternated three times:

| Python | threads | old, median | new, median | old, best | new, best |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3.13 + numpy | 1 | 0.196-0.256 s | 0.197-0.246 s | 0.178-0.227 s | 0.165-0.213 s |
| 3.13 + numpy | 4 | 0.121-0.166 s | 0.089-0.136 s | 0.109-0.155 s | 0.082-0.117 s |
| 3.11, no numpy | 1 | 0.209-0.259 s | 0.203-0.214 s | 0.192-0.202 s | 0.176-0.194 s |
| 3.11, no numpy | 4 | 0.122-0.130 s | 0.118-0.128 s | 0.107-0.124 s | 0.103-0.117 s |

With numpy, the four-thread read is about 1.3-1.4 times faster (paired runs: 0.121 to 0.093,
0.131 to 0.089, 0.122 to 0.094, 0.166 to 0.107 s). One thread and the no-numpy path are unchanged
within the host's noise. Raw timings: this run's transcript.

## Not done

- What is left on the calling thread: allocating the plane (`array(..., bytes(n))` builds a zeroed
  `bytes` and then copies it, 2 x 24 MB for this file) and the IFD walk.
- C prediction for point-transform scans (the numpy pass still runs those).
