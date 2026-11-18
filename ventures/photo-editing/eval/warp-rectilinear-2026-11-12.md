# WarpRectilinear: lens distortion from the DNG, checked against the camera's own preview (2026-11-12)

## Why

The Leica T DNG in `eval/camera-dngs-2026-11-12.md` carries a `WarpRectilinear` opcode in
`OpcodeList3`, marked required. ShootFlow listed it as "not applied", so its renders kept the lens's
distortion and lateral colour, which the camera and Adobe's readers correct. The flagship's `next:`
put it first among the items a cloud session can build.

## What the file holds

`dng/Leica T (Typ 701).dng` from the public metadata-extractor-images collection (fetched at check
time, not committed): 4944 x 3278, DefaultCrop 4928 x 3264, one `WarpRectilinear`, three planes,
optical centre (0.5, 0.5), no tangential terms:

| plane | kr0 | kr1 | kr2 | kr3 | f(1) |
| --- | --- | --- | --- | --- | --- |
| R | 0.970578 | 0.025468 | 0.002716 | 0.001237 | 1.000000 |
| G | 0.970815 | 0.025608 | 0.002309 | 0.001158 | 0.999890 |
| B | 0.970659 | 0.025587 | 0.002058 | 0.001119 | 0.999423 |

`f(r) = kr0 + kr1 r^2 + kr2 r^4 + kr3 r^6` is the ratio of source radius to output radius, with `r = 1`
at the corner. The corners stay where they are, and the centre reads from 0.97 of its own radius:
the lens has pincushion distortion and the correction pulls the middle outward. The planes differ by
up to 0.00058 at the corner. That is lateral colour: blue sits 1.4 px off green at the corners at
full size, and about 0.2 px off at the flowers.

## What runs

`shootflow.dng_opcodes` parses `WarpRectilinear` (plane count, six terms per plane, centre) and runs
it after demosaic on the white-balanced linear image, clipped as the encoder clips it. Colour
matrix, profile look tables and the sRGB curve come after it. White balance and the matrix are
linear, so warping after white balance gives the same result as warping the camera values. Each
output pixel `(x, y)` reads from

    centre + m * (f dx + kt0 2 dx dy + kt1 (r2 + 2 dx^2),  f dy + kt1 2 dx dy + kt0 (r2 + 2 dy^2))

where `(dx, dy)` is the pixel centre's offset from the optical centre divided by `m`, the distance
to the farthest corner. The source is sampled bilinearly, and the image edge is clamped. Both
engines repeat the same float64 operations and give the same bytes. It is on by default with the
other opcodes; `--no-opcodes` and `DevelopSettings(opcodes=False)` turn it off. Half-size develops
apply the same opcode on the half-size grid (the formula is in relative coordinates).

Choices the specification leaves open, named so a later Adobe comparison can find them: pixel
centres at `x + 0.5`; bilinear sampling (Adobe's SDK uses a wider kernel); edge clamping.

## Check 1: the formula, on synthetic images (`tests/test_dng_warp.py`, 13 tests)

Bilinear sampling reproduces a linear function exactly. So on a horizontal ramp, every warped pixel
must equal the ramp at the source point. The test computes that point from the specification's
formula, written out separately from the module. Five cases pass to 1e-9: identity, magnification,
the Leica's red plane, an off-centre barrel and tangential terms. The tests also cover per-plane
terms (lateral colour), edge clamping, an identity warp changing no bytes, `opcodes=False` skipping
the warp, and a truncated opcode being reported and skipped. The numpy and pure-Python engines
match byte for byte with random radial and tangential terms, an off-centre axis, odd sizes and
both full and half size.

## Check 2: an independent reader

darktable's lens module (`src/iop/lens.cc`, the "embedded metadata" path for DNG; read, not
copied) builds the same per-plane `kr0 + kr1 r^2 + kr2 r^4 + kr3 r^6` from the opcode. It uses it
as the factor from an output point's offset to its source point, with `r` normalised by the
half-diagonal. The direction, the polynomial and the normalisation agree with ShootFlow's. Their
pixel convention (`x - w/2` against our `x + 0.5 - w/2`) moves a source point by `0.5 (1 - f)`,
at most 0.015 px on this lens. darktable ignores the optical centre and the tangential terms;
this file has neither.

## Check 3: the camera's own render

The DNG carries the camera's 720 x 480 JPEG preview, which the camera rendered with its
correction applied. `tools/warp_preview_check.py` develops the frame half size with the opcodes on
and off, scales each render to 720 x 480 and block-matches 32 px patches of the preview against
it (search +-10 px, normalised cross-correlation of at least 0.9, sub-pixel by a parabola). 444
patches qualified. The frame is flowers against blurred grass, so it has no straight edges; this
check stands in for the straight-edge test the flagship's note suggested.

| radius (1 = corner) | patches | shift with warp on, median / p90 (preview px) | warp off, median / p90 | predicted off |
| --- | --- | --- | --- | --- |
| 0.0-0.1 | 6 | 0.30 / 0.60 | 0.89 / 1.03 | 0.79 |
| 0.1-0.2 | 28 | 0.49 / 1.29 | 2.02 / 2.79 | 1.97 |
| 0.2-0.3 | 46 | 0.46 / 1.56 | 2.93 / 3.67 | 3.06 |
| 0.3-0.4 | 67 | 0.37 / 0.82 | 3.84 / 4.25 | 3.97 |
| 0.4-0.5 | 80 | 0.26 / 0.66 | 4.42 / 4.90 | 4.66 |
| 0.5-0.6 | 67 | 0.32 / 0.80 | 4.85 / 5.31 | 5.04 |
| 0.6-0.7 | 65 | 0.49 / 1.23 | 4.81 / 5.11 | 5.03 |
| 0.7-0.8 | 61 | 0.40 / 1.11 | 4.19 / 4.62 | 4.51 |
| 0.8-0.9 | 23 | 0.69 / 1.33 | 3.40 / 4.12 | 3.57 |
| 0.9-1.0 | 1 | 0.55 | 1.85 | 2.18 |

With the warp on, the median radial shift is +0.18 px, mean |radial| 0.32 and mean |tangential|
0.34. The radial error is no larger than the tangential noise, which no lens model could explain.
With the warp off, the median radial shift is -4.22 px (mean |radial| 3.97). Its profile across
radius follows the formula's prediction within 0.1-0.3 px in every band: it peaks near r = 0.55 and
falls back to near zero at the corners, where f = 1. In preview pixels, 5 px is 34 px at full size.

What this shows: the camera's own render has the geometry ShootFlow now produces, to the
preview's resolution (about a third of a preview pixel, or two full-size pixels). It does not test
the lateral-colour planes: their 0.2-1.4 px full-size differences are below the preview's
resolution.

Speed (numpy engine, this container): half size 0.7 s without the warp and 2.1 s with it; full
size 2.2 s and 8.0 s (the warp holds a float64 copy of the image, about 390 MB at full size).

## Reproduce

    curl -LO "https://raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/dng/Leica%20T%20(Typ%20701).dng"
    PYTHONPATH=src python3 tools/warp_preview_check.py "Leica T (Typ 701).dng"

(numpy and Pillow; about 15 s.)

## Not done

- No Adobe render of this frame to compare pixel values with (sampling kernel, pixel convention).
- Lateral colour is run but not measured on a real edge. It needs a frame with sharp, high-contrast
  edges near the corners.
- `WarpFisheye`, `FixVignetteRadial`, `FixBadPixels*`, `MapPolynomial` and the others are still
  named, not run.
