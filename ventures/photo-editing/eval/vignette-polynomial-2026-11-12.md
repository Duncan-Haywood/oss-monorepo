# FixVignetteRadial and MapPolynomial (2026-11-12)

## What landed

`shootflow.dng_opcodes` runs DNG opcodes 3 (`FixVignetteRadial`) and 8 (`MapPolynomial`) from
`OpcodeList2` and `OpcodeList3`, in list order with `GainMap` and `WarpRectilinear`
(`Plan.stage2`, `Plan.stage3`; `run_stage3_rgb` and `run_stage3_planes` for stage 3). The
formulas, and the choices the DNG specification 1.4 leaves open, are in the module docstring:

- vignette: pixel centres at `x + 0.5`; `r = 1` at the farthest corner; gain evaluated per pixel
  in float64 (the DNG SDK builds a fixed-point mask on a coarser grid); value capped at white;
- polynomial: Horner evaluation, pinned to 0..1, area/plane/pitch as GainMap's;
- stage 3 holds white-balanced values, so the polynomial runs on value / scale and multiplies
  back, and the vignette's cap is the plane's scale;
- `OpcodeList1` (stored raw values) is still not run: named in the report only.

## Checks

`tests/test_dng_vignette_poly.py`, 13 tests, all passing (Python 3.13 with numpy):

| test | answer it is held to |
| --- | --- |
| gain at 200 random pixels, random terms and centres | formula written out in the test, 12 places |
| corner gain on a 10,000 px frame with centre at a corner | `1 + k0 + ... + k4`, 3 places |
| raw darkened by `1 / gain`, vignette in OpcodeList2 | undarkened develop within 3 8-bit steps; off, more than 20 |
| red sensels halved, polynomial `2x` at pitch 2 | undarkened develop within 3 8-bit steps |
| stage-3 vignette then polynomial, white-balance scales 2.1/1.0/1.6 | closed form at every pixel, 12 places |
| polynomial area rows 1-3 step 2, columns 2-5 step 3, plane 1 | exactly those samples doubled |
| identity vignette and polynomial in OpcodeList3 | within one 16-bit step of no opcodes |
| numpy against pure Python, mixed list in both stages, full and half size, two sizes | identical bytes and notes |

## A real file: not found yet

`raw.githubusercontent.com` answers but directory listings (`api.github.com` trees,
`github.com/.../tree`) return 403, so the metadata-extractor-images DNG folder can only be
probed by name. Tried and absent (both `.dng` and, for most, `.DNG`): Leica M9, M (Typ 240),
Q (Typ 116), M10, SL (Typ 601), X Vario (Typ 107), S (Typ 007), M Monochrom; Ricoh GR, GR II,
GR III; Pentax K-1, K-3, K-5, K-30, 645Z, K-S1; Samsung Galaxy S7, S8; Apple iPhone 12 Pro,
iPhone 8; Google Pixel, Pixel 3; OnePlus 6; Hasselblad X1D; DJI Mavic Pro, Phantom 4,
Phantom 4 Pro, Mavic 2 Pro, FC220; Sigma fp; Huawei P20 Pro; Xiaomi Mi 9; Nokia Lumia 1020; LG G4;
Motorola Moto X; Sony Xperia; Canon EOS 5D Mark III; Nikon D800. The known names (LG Nexus 5X,
Leica T (Typ 701), Pentax QS1) carry GainMap or WarpRectilinear, not these.

Next: a DNG that carries either opcode (Adobe DNG Converter output with lens corrections, some
Leica, Pentax and drone files are the candidates), developed here and compared with the
camera's own preview, as `tools/warp_preview_check.py` does for the warp.

Rerun: `cd ventures/photo-editing && PYTHONPATH=src:tests python3 -m unittest test_dng_vignette_poly`.
