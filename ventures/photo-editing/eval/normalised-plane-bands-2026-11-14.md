# Sensor normalisation in threaded bands (2026-11-14)

`eval/threaded-develop-2026-11-13.md` put the numpy develop's demosaic, colour and encode on a
thread pool and named what was left on one thread: `raw_develop_np._normalised_plane`, about
0.2 s of a 1.1 s four-thread develop. That stage reads the active area, linearises it, subtracts
black (per CFA phase, plus the row and column deltas), scales to 0..1, clamps to the per-row
white caps and counts clipped sensels.

The code was written by an earlier session (PR #15457, `claude/cool-franklin-bx28my`), which
stopped before measuring it. This run took its one commit over, checked it and measured it.

## What changed

`_normalised_plane` now writes into one preallocated float64 plane, band by band, through
`_run_bands` (256 rows, `SHOOTFLOW_THREADS` threads, default every CPU). Each band does the
whole row arithmetic for its own rows: the table lookup, black, the deltas, the scale, the clamp
and its own clip count, summed at the end. Row phases (black/scale `y % rr`, caps `y % 2`) are
taken from the global row index, not the band's. When stage-2 opcodes (GainMap) are present they
still run once on the whole plane between two banded passes, since a framed opcode can span
bands: pass one normalises and clamps to 0..1, the opcodes run, pass two applies the caps and
counts.

## Same bytes

`eval/normalised-plane-bands.py` on the Leica T (Typ 701) DNG (4928 x 3264, 12-bit packed),
before (`main` at 67cfce4f3) and after, at 1, 2 and 4
threads, best of 3. SHA-256 (first 16 hex) of the output:

| output | before, 1/2/4 threads | after, 1/2/4 threads |
|---|---|---|
| `_normalised_plane` (float64 plane) | 692b58a19b44afde | 692b58a19b44afde |
| clipped sensels | 168,822 | 168,822 |
| develop, default (opcodes, cubic warp) | a68c6ac0001c4f91 | a68c6ac0001c4f91 |
| develop, no opcodes | 8f0006a926fbe3df | 8f0006a926fbe3df |
| develop, half size (warp on) | fc54d121fe1087dc | fc54d121fe1087dc |

The develop hashes are the ones in the 2026-11-13 notes. Raw output:
`eval/normalised-plane-bands.before.txt`, `eval/normalised-plane-bands.after.txt`.

## Time

Same container, 4 CPUs.

| stage | before, 1 | before, 2 | before, 4 | after, 1 | after, 2 | after, 4 |
|---|---:|---:|---:|---:|---:|---:|
| `_normalised_plane` | 0.243 s | 0.237 s | 0.242 s | 0.125 s | 0.073 s | 0.050 s |
| develop, no opcodes | 2.27 s | 1.18 s | 0.93 s | 1.60 s | 1.00 s | 0.70 s |
| develop, half size | 2.13 s | 1.18 s | 1.14 s | 1.57 s | 1.03 s | 0.74 s |
| develop, default | 11.01 s | 4.36 s | 3.15 s | 8.60 s | 4.40 s | 2.65 s |

- The stage is 4.8 times faster on four threads and twice as fast on one: the old code built three
  full-size float64 temporaries (the lookup, the subtraction, the clamp) and walked them whole;
  a 256-row band stays in cache.
- The unwarped develop on four CPUs drops from 0.93 s to 0.70 s (25%), the half-size review
  still from 1.14 s to 0.74 s. The warped default develop is dominated by the warp; its gain
  (3.15 s to 2.65 s) is within the run-to-run spread seen here (the one-thread default ran
  11.0 s before, against 9.2 s in the 2026-11-13 note).

## Checked

- `tests/test_raw_develop_engines.py`
  `BandedThreadsTests.test_normalised_plane_bands_with_every_term`: a linearisation table, 2x2
  black and scale, row and column deltas, one and three samples a pixel, with and without a gain
  map, at band heights 1, 2, 3 and 7 and 1-3 threads, against one band on one thread, byte for
  byte and the clip count. The existing tests compare the whole numpy develop with the pure-Python
  engine; all 16 pass, and the venture's full suite is 920 passed, 5 skipped.
- Four seeded faults, each caught by that file: caps phase from the band's row instead of the
  image's (69 subtests fail), black phase likewise (36), the row delta from the band's row (48),
  clip counts overwritten instead of summed per band (72).

## Not checked

- A real DNG carrying a GainMap through the two-pass path on more than one thread (the Pixel 3 XL
  lossless DNG has none; the synthetic test covers it).
- Memory: the plane is allocated once instead of three temporaries; peak not measured.
