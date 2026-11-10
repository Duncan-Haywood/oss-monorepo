# Optional numpy engine for the DNG developer (2026-11-10)

What changed: `raw_develop.develop` hands its per-pixel work (levels, clamps, bilinear or half-size
demosaic, colour matrix, sRGB curve, crop, orientation) to `src/shootflow/raw_develop_np.py` when numpy
can be imported. `DevelopSettings(engine=...)` and `shootflow develop --engine` take `auto` (the
default), `python` or `numpy`; the report carries `engine`. ShootFlow itself still needs nothing but
the standard library: without numpy, `auto` runs the pure-Python loops as before.

Claim: the two engines write **the same bytes**, not close values. The numpy code does each
floating-point operation of the pure path in the same order on IEEE doubles. numpy's `add` and
`multiply` ufuncs are separate roundings (no FMA), so each sample rounds identically. Where order
matters it is kept: `(v - (black + dv)) * scale` on the fast path and `(((v - black) - dv) - dh) * scale`
otherwise; bilinear sums neighbours in the 3x3 offset order from 0.0, with an out-of-image neighbour
adding +0.0 (no change to any sum); half size adds the 2x2 block in row order; each matrix row is
`(m0*r + m1*g) + m2*b`. Images under 2x2 pixels stay on the pure path, which reflects neighbours at a
1-pixel edge.

## Real camera files

Files: rawpy's GitHub test folder (`test/iss030e122639.NEF`, a NASA photo from the ISS, Nikon,
12 MP, RGGB; `test/RAW_CANON_5DMARK2_PREPROD.CR2`, 21 MP, GBRG, per-position black 1026/1027),
their sensor data written into uncompressed DNGs by `tools/libraw_differential.py --keep`.
Command: `PYTHONPATH=src python3 tools/develop_engine_check.py NIKON.dng CANON.dng [--half]`
(Python 3.13, numpy 2.5.3, the shared build container, one run each). Times are `develop` only,
after the file is read.

| file | output | pure Python s | numpy s | speed-up | byte-identical | sha256 (first 16) |
|---|---|---|---|---|---|---|
| Nikon NEF iss030e122639 | 4284x2844 full | 31.01 | 1.50 | 20.7x | yes | a6ff7e89f1102927 |
| Nikon NEF iss030e122639 | 2142x1422 half | 8.77 | 0.56 | 15.7x | yes | 4e02c3f960545cc0 |
| Canon 5D Mark II CR2 | 5634x3752 full | 54.17 | 2.61 | 20.8x | yes | 1a919bc91341ee00 |
| Canon 5D Mark II CR2 | 2817x1876 half | 15.59 | 1.07 | 14.6x | yes | 4c791542ae23965c |

Reading the file (pure Python both ways): 0.83 s Nikon, 2.26 s Canon.

`tools/libraw_differential.py` rerun on the same four cases with the numpy engine gives the
`raw-develop-libraw-2026-11-10.md` numbers to the third decimal (Nikon full: mean 0.088/0.102/0.101 of an
8-bit step, max 0.51, 0 pixels over one step; Canon full: 0.107/0.119/0.107, max 0.6, 0 over),
as byte-identical output must. Its whole develop-file time is now 2.1 s Nikon and 4.6 s Canon
full size (was 37.1 s and 65.1 s).

`tools/real_dng_pipeline.py` on the Nikon card (one DNG with no preview, one 1 s clip): the
overnight pipeline rendered every deliverable with nothing for review in **7.5 s** (74.5 s in
`pipeline-dng-grade-2026-11-10.md`), master 4284x2844 rgb48le, and the same LibRaw comparison
(mean 0.288/0.288/0.293, p99 0.778, max 1.459, 11,138 pixels over one step).

## Tests

`tests/test_raw_develop_engines.py` (10 tests, 52 subtests) develops noisy synthetic DNGs (noise so
the clamps at black and at the clip level both fire) with both engines and compares the arrays,
sizes, clip fraction and notes: every Bayer phase at even and odd sizes, full and half; 2x2, 3x2 and
2x3; 2x2 and 1x2 black repeat patterns, row and column black deltas and both together; a
linearization table with codes past its end; active area with default crop at every orientation
0-9 (1-8 plus two out-of-range values) full and half, and a crop that does not fit; exposure,
baseline exposure off, custom white balance and clipping; LinearRaw at orientation 1 and 8. It also
checks the engine choice (unknown engine refused; a 1-pixel-wide image stays on Python under
`auto` and is refused under `numpy`). The tests skip without numpy. The repository's photo-editing
CI installs no numpy, so CI keeps testing the pure path and the equivalence is checked where numpy
is present (here, locally).

Mutation check, by hand: rounding the curve index with +0.49 instead of +0.5 failed 50 subtests;
swapping orientation 6 for 8 failed 2. Changing the last bits of a float (multiplying the row black
delta by 1.0000001, adding 1e-12 to a sum) changed no 16-bit output on these scenes, so the tests
show the outputs agree; that the order is kept is shown by reading the code, above.

Not done: the file reader and the lossless-JPEG decoder are still pure Python. Their speed on a
camera-written lossless-JPEG DNG is not measured (none was available from the build container).
