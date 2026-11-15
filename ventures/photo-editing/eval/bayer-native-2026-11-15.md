# The directional Bayer demosaic in C (2026-11-15)

## Why

The directional demosaic (`eval/bayer-directional-demosaic-2026-11-15.md`) became the default for
every Bayer raw file earlier today, and it ended with "A C path (1.8 s against LibRaw's 1.0 s for
24 MP)" in its open list. Every DNG, CR2, CR3, NEF, ARW, ORF, RW2, SRW, PEF and GFX RAF the
developer reads goes through it, so its time is paid on nearly every frame of a shoot. The numpy
code makes about seventy band-sized temporaries per band (shifted copies, masks, `np.where`
blends): most of its time is moving memory, not arithmetic.

## What was built

`src/shootflow/bayer_native.py`: one C function, `shootflow_bayer_piece`, that runs
`bayer_demosaic._piece`'s steps over one padded band (row and column estimates, colour-difference
gradients, window sums, direction weights, green, the four diagonal weights shared by red and blue,
red and blue as colour differences). It is carried as a string, built with the system compiler on
first use (`-O2 -ffp-contract=off`, cached under `$SHOOTFLOW_CACHE` by a hash of the source and
flags) and loaded through `ctypes`, the same pattern as the raw decoders in `ljpeg_native.py`. It
was written from the numpy code in this repository, not from any other demosaic's source.

- Same float32 arithmetic, same order of operations, edge reads repeated as numpy's `_sh` repeats
  them (through two clamped-index lookup tables, so the inner loops carry no branches).
  `-ffp-contract=off` stops the compiler fusing `a * b + c`, which would change the last bit.
- `directional(..., native=None)` (the default) takes it whenever it builds and `median_passes` is
  0 (the default) and `window` is 0-12; `native=False` forces numpy, `native=True` refuses to fall
  back. The median clean-up stays numpy-only. `SHOOTFLOW_NATIVE=0` turns every C path off.
- Bands are 128 rows on the C path (17 band planes, about 60 MB per thread at 6,000 columns) and
  run on the same thread pool; the band height and thread count change no bit (tested).

## How it was checked

`tools/bayer_native_check.py` on the five real frames of the directional note (from
drewnoakes/metadata-extractor-images, not committed): the visible sensor data read through rawpy
0.25 (LibRaw 0.22.2), black-subtracted, scaled and white-balanced as the developer does, then
demosaiced with `native=False` and `native=True`. Best of two runs, four CPUs, idle machine (a first
run overlapped the test suite and was discarded). Rows: `eval/bayer-native-2026-11-15.jsonl`.

| frame | size | equal bit for bit | numpy, 1 thread | numpy, 4 | **C, 1 thread** | **C, 4** | speed-up (4) | LibRaw AHD postprocess |
|---|---|---|---|---|---|---|---|---|
| Canon EOS 70D (CR2) | 5496 x 3670 | yes | 4.22 s | 1.70 s | 1.39 s | **0.41 s** | 4.2x | 1.06 s |
| Nikon D810 (NEF) | 7380 x 4928 | yes | 8.25 s | 2.99 s | 2.65 s | **0.71 s** | 4.2x | 1.91 s |
| Sony A7 III (ARW) | 6024 x 4024 | yes | 4.86 s | 2.13 s | 1.73 s | **0.44 s** | 4.9x | 0.99 s |
| Olympus E-M10 (ORF) | 4640 x 3472 | yes | 3.97 s | 1.42 s | 1.17 s | **0.30 s** | 4.8x | 0.80 s |
| Pentax K-1 II (PEF) | 7376 x 4932 | yes | 7.83 s | 3.02 s | 2.62 s | **0.62 s** | 4.9x | 1.86 s |

- **Every output is equal to numpy's bit for bit** (largest difference 0.0) on all five frames, so
  every quality number in the directional note holds unchanged for the C path.
- **4.2-4.9x faster than numpy on four CPUs**, 2.8-3.4x on one. A 24 MP frame now demosaics in
  0.44 s, under LibRaw's AHD `postprocess` (0.99 s). That LibRaw figure is single-threaded and
  includes its colour and output steps, so it is a yardstick, not a like-for-like race: on one
  thread ours is 1.4-1.7x LibRaw's whole `postprocess`.
- Synthetic checks (`tests/test_bayer_native.py`, 6 tests): bit-identical on all four Bayer phases
  for both red/blue modes, windows 0-12, frames from 2 x 2 to 301 x 77; `power` other than 2 goes
  through `powf` and stays within 1e-5 (measured up to 1.8e-7); bands and threads change nothing;
  auto falls back to numpy for the median and windows past 12; the off switch works.
- The full photo-editing suite (1,196 tests) passes with the C path on, including the developer
  tests that pick the directional demosaic by default.

A first version clamped every read with two comparisons: 2.06 s on one thread for a 24 MP plane of
noise. Moving the clamps into lookup tables took that to 1.68 s, the same output. `-O3` changed
nothing measurable and was not kept.

## Open

- One thread is still 1.4-1.7x LibRaw's single-threaded AHD; the C keeps 13-17 whole-band planes
  where a row-ring buffer would keep a few rows, which is the next speed step if one is wanted.
- The median clean-up has no C path (it is off by default).
- X-Trans (`xtrans_demosaic.py`) has no C path yet; the same approach should apply.
