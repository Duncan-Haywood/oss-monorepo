# The learned Bayer demosaic, fused and vectorized (2026-11-16)

Flagship item (BUILDABLE HERE): "Bayer learned: in C 2026-11-16, 2.6-3.3x the default's time; fuse its
feature passes". The C path of `laplace="learned"` (`eval/bayer-learned-native-2026-11-16.md`) computed
its eight features in about 30 whole-band passes over 15 band-sized planes, read every neighbour through
the clamped-index tables, and was built at `-O2`, so none of its loops vectorized. This note rewrites
the feature side (`learned_map` in `src/shootflow/bayer_native.py`) and keeps the output bit for bit.

## What changed

- **One row pipeline instead of whole-band passes.** At step k, sweep one computes row k's per-sensel
  inputs from the raw (the two colour-difference lines, curvature, slope, green disagreement, level,
  the 3/16 colour differences) and the horizontal halves of their box sums. Sweep two computes row
  k-1's second differences and gradient inputs (they read rows k-2 .. k) and their horizontal sums.
  Then the vertical halves of all twelve box sums, the eight features and the fitted weight of row k-3
  run together. Every intermediate lives in an 8-row ring per plane (18 rings, about 3.5 MB at 6,000
  columns), so the feature side allocates and writes no band-sized plane but the weight itself. It used
  to write 15. A 128-row band's buffer was about 47 MB, over glibc's 32 MB mmap ceiling, so every band
  paid for fresh zeroed pages.
- **The 5 x 5 row sums continue the 3 x 3 ones.** `_box` adds `a + (a[-1] + a[+1]) + (a[-2] + a[+2])`
  in that order, so the 5 x 5 row sum is the 3 x 3 one plus `(a[-2] + a[+2])`. These are the same
  additions in the same order.
- **Vectorized interiors.** Each stencil runs the interior columns with direct indexing and only the two
  edge columns either side through the clamped table. The row bodies are functions with `restrict`
  parameters (GCC 13 would not vectorize them through pointers loaded from an array). The library is
  now built with `-O3 -ffp-contract=off`. That changes no bit: there is no `-ffast-math`, so every
  vector lane does the same IEEE float32 operations in the same order, and no `a * b + c` becomes a
  fused multiply-add. The default path's `box_sum` uses the same row and column helpers.

## How it was checked

`tools/bayer_native_check.py --laplace learned` on the same seven real frames as the earlier note, from
drewnoakes/metadata-extractor-images (not committed), read through rawpy 0.25 (LibRaw 0.22),
black-subtracted, scaled and white-balanced as the developer does. Best of two runs on four CPUs. Rows:
`eval/bayer-learned-fused-2026-11-16.jsonl`.

| frame | size | equal bit for bit | **C, 1 thread** | **C, 4** | default (3/16) C, 4 | learned / default | numpy, 4 | C vs numpy (4) | LibRaw AHD postprocess |
|---|---|---|---|---|---|---|---|---|---|
| Canon EOS 70D | 5496 x 3670 | yes | 2.14 s | **0.70 s** | 0.37 s | 1.9x | 2.72 s | 3.9x | 1.09 s |
| Nikon D810 | 7380 x 4928 | yes | 4.14 s | **1.28 s** | 0.71 s | 1.8x | 5.38 s | 4.2x | 2.03 s |
| Sony A7 III | 6024 x 4024 | yes | 2.72 s | **0.73 s** | 0.38 s | 1.9x | 2.90 s | 4.0x | 1.10 s |
| Olympus E-M10 | 4640 x 3472 | yes | 1.61 s | **0.43 s** | 0.27 s | 1.6x | 2.05 s | 4.7x | 0.94 s |
| Pentax K-1 II | 7376 x 4932 | yes | 4.29 s | **1.31 s** | 0.90 s | 1.5x | 5.38 s | 4.1x | 1.82 s |
| Sony A7 IV | 7028 x 4688 | yes | 3.73 s | **1.11 s** | 0.55 s | 2.0x | 4.73 s | 4.3x | 1.88 s |
| Canon EOS 7D | 5202 x 3464 | yes | 1.92 s | **0.49 s** | 0.28 s | 1.7x | 2.29 s | 4.7x | 1.25 s |

Before and after on the same machine in the same hour (the old code from `main`, rows in
`eval/bayer-learned-fused-before-2026-11-16.jsonl`):

| frame | old C, 1 | new C, 1 | old C, 4 | new C, 4 |
|---|---|---|---|---|
| Sony A7 III | 5.94 s | 2.72 s | 1.35 s | 0.73 s |
| Pentax K-1 II | 9.19 s | 4.29 s | 2.43 s | 1.31 s |

- **Every output equals numpy's bit for bit** (largest difference 0.0) on all seven frames, the 7D's
  G-B/R-G phase included. Every quality number in `eval/bayer-learned-laplace-2026-11-16.md` holds.
- **The learned demosaic is 1.8-1.9x faster on four CPUs and 2.1-2.2x on one** than this morning's C
  path. It now costs **1.5-2.0x the default's time** (it was 2.6-3.3x), 0.73 s for 24 MP on four cores, and
  it is 3.9-4.7x faster than numpy. It is now faster than LibRaw's single-threaded AHD `postprocess` on
  every frame (a yardstick only: LibRaw's time includes its colour and output steps).
- **The default path is unchanged within noise.** It also builds at `-O3` and uses the new box-sum
  helpers. It moved 0.48 to 0.38 s on the A7 III but 0.72 to 0.90 s on the K-1 II between runs. This
  cloud container's timings vary 10-25% from run to run, so compare within a row, not across tables.
  It stays bit-identical to numpy (`tests/test_bayer_native.py`).
- On a synthetic 24 MP frame (`_scene` from the tests, 6024 x 4024), back to back: learned 6.44 s to
  2.76 s on one thread and 1.76 s to 0.79 s on four; the default 2.04 s to 1.51 s and 0.65 s to 0.54 s.
- Tests: `tests/test_bayer_native.py` keeps every earlier bit-equality test (four phases, both red/blue
  modes, 2 x 2 to 97 x 131, linear and constant weight lists, band heights and thread counts). A new test
  covers every frame height from 2 to 19 rows, so the band is shorter than, as tall as and taller than
  the 8-row ring.

## Open

- It is still opt-in, and speed is no longer the reason: it loses on the synthetic sheet (near-Nyquist
  detail, `eval/bayer-learned-laplace-2026-11-16.md`). Training on noisy and near-Nyquist frames, or a
  real photograph with fabric moiré or fine print and known truth, would settle whether it becomes the
  default.
- Most of what remains is the 45-term quadratic (36 product passes per row) and the twelve vertical
  sums. A blocked evaluation that keeps a row chunk in registers would cut it further. Any change must
  keep the same per-sensel order of additions.
- `-O3` vectorization was checked with GCC 13.3 here. Clang vectorizes at `-O2` already and also
  honours `-ffp-contract=off`, but it has not been run against numpy here.

## Command (from `ventures/photo-editing`)

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/bayer_native_check.py --laplace learned FILE.cr2 [...] > rows.jsonl
