# The directional X-Trans demosaic in C (2026-11-15)

## Why

Every Fujifilm X-Trans file the developer reads (uncompressed, lossless and lossy compressed RAF) goes
through the directional X-Trans demosaic (`src/shootflow/xtrans_demosaic.py`), and its open list since
2026-11-14 has said "a C path". With numpy it took about 5 s for a 16 MP frame on four cores, twice
LibRaw's single-threaded three-pass Markesteijn (2.5 s). The Bayer demosaic got its C path earlier the
same day (`eval/bayer-native-2026-11-15.md`); this is the X-Trans twin.

## What was built

`src/shootflow/xtrans_native.py`: one C function, `shootflow_xtrans_piece`, that runs all of
`xtrans_demosaic._directional_piece` on one padded piece: the isotropic 3x3 estimates, the four
directional greens (clamped between the two greens each is interpolated from), red and blue per
direction as 3x3 colour differences, the gradient blend with weights (D_min / D)^4, any number of
passes and median clean-ups. It is carried as a string, built with the system compiler on first use
(`-O3 -ffp-contract=off`, no fast-math), cached under `$SHOOTFLOW_CACHE` by a hash of source and flags,
loaded through `ctypes` (the pattern of `ljpeg_native.py` and `bayer_native.py`), and written from the
numpy code in this repository, not from dcraw's or LibRaw's source.

- **Same arithmetic, same order.** Every read past the piece's edge is reflected exactly as
  `np.pad(mode="reflect")` does (lookup tables); the 3x3 boxes add columns of three, then rows of three,
  as `_box3`; the directional green is computed in double, because numpy promotes `int64 * float32` to
  float64 there; the empty-window fallback of `_box_average` (box of a box) is reproduced, and a test
  layout found by search exercises it.
- **One change to the numpy reference.** numpy's float32 `x ** 4` goes through the CPU's SIMD maths
  library: on this machine (AVX-512) it differed from libm's `powf` on 41,436 of 200,000 random values,
  and numpy's own scalar path differed from its array path. The weights are now computed as
  `(q * q) * (q * q)`, which is exact IEEE arithmetic on every machine, in numpy and in C. On the two real
  frames this moves 22% of output values by at most 3.0e-7 of full scale (0.02 of a 16-bit step; 162-164
  dB PSNR between old and new), so every quality number in `eval/xtrans-clamp-gradient-2026-11-15.md`
  stands.
- `directional(..., native=None)` (the default) takes the C path whenever it builds and
  `select="gradient"` (the default); `native=False` forces numpy, `native=True` refuses to fall back;
  `select="homogeneity"` (the 2026-11-14 rule) stays numpy. `SHOOTFLOW_NATIVE=0` turns every C path off.
  Bands, overlap and threads are numpy's (192 rows, four threads by default).

### Speed work, measured on one 288 x 4976 band of the X-E1 (standalone C harness)

| version | one band |
|---|---|
| first, pointwise 3x3 boxes, per-pixel `y % 6` | 0.52 s |
| separable boxes, mask sums once per piece, phase table | 0.44 s |
| median network unrolled, 4 lanes with GCC/clang vector extensions | 0.30 s |
| box average fused with its fill and divide, edge columns out of inner loops, `-O3` | 0.21 s |

The median's sorting network was 40% of the first version's time: GCC would not vectorise the scalar
loop ("control flow in loop"), so it runs on `vector_size(16)` types (SSE on x86-64, NEON on ARM) with a
lane-wise select that picks exactly what the scalar min and max pick.

## How it was checked

- `tests/test_xtrans_native.py` (7 tests, 61 subtests): bit for bit against numpy on all 24 phases of
  the X-E1 layout tried (6 row shifts x 4 column shifts), clamp on and off x 1-3 passes x 0-2 medians,
  the 2x2 Bayer layouts, frames from 6 x 6 to 500 x 90, a sparse layout that takes the wide fallback,
  flat fields, a non-default scale, band heights and thread counts, the homogeneity fallback and the off
  switch.
- The full photo-editing suite passes with the C path on.
- `tools/xtrans_native_check.py` on the two real X-Trans RAFs in drewnoakes/metadata-extractor-images
  (`raf/Fujifilm X-E1.raf`, `raf/FujiFilm EX-2.raf`, not committed), read with rawpy 0.25 (LibRaw
  0.22.2), white-balanced as `tools/xtrans_demosaic_check.py` does, default settings, best of two, four
  CPUs. Rows: `eval/xtrans-native-2026-11-15.jsonl`.

| frame | size | equal bit for bit | numpy, 1 thread | numpy, 4 | **C, 1 thread** | **C, 4** | LibRaw Markesteijn 1 pass | 3 passes |
|---|---|---|---|---|---|---|---|---|
| Fujifilm X-E1 | 4952 x 3288 | yes (max diff 0.0) | 17.99 s | 5.01 s | 4.42 s | **1.29 s** | 1.66 s | 2.51 s |
| Fujifilm X-E2 | 4934 x 3296 | yes (max diff 0.0) | 17.24 s | 4.97 s | 4.43 s | **1.26 s** | 1.63 s | 2.52 s |

- **Equal to numpy bit for bit on both real frames**, so the quality numbers of the X-Trans notes hold
  unchanged for the C path.
- **3.9-4.1x faster than numpy on four cores and on one** (a numpy single-thread run earlier in the
  session took 13.3-14.1 s on the same frames, the machine was not idle for every run; the four-core
  figures repeated within 3%). A 16 MP X-Trans frame now demosaics in 1.3 s, under LibRaw's
  single-threaded one-pass (1.6 s) and three-pass (2.5 s) `postprocess`, which also include LibRaw's
  colour and output steps: a yardstick, not a race. On one thread ours is 1.8x LibRaw's three-pass,
  for a result 0.5-0.7 dB short of it.
- Of the 4.4 s on one thread, 0.5 s is numpy around the C call (the crop to float64 and putting each
  sensel's own value back, `_finish`) and the band overlap (264 rows computed per 192 kept).

## Open

- One thread is 1.8x LibRaw's three-pass: the C keeps 26 whole-piece planes (about 140 MB per thread
  at 5,000 columns); the green gather and the colour-difference fills are the largest remaining steps.
- `_finish` (0.5 s single-threaded on 16 MP) could move into the C call.
- `select="homogeneity"` has no C path (kept only to reproduce 2026-11-14's numbers).
