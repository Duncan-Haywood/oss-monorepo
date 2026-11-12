# The DNG opcodes against the specification's own text (2026-11-12)

## Why

ShootFlow runs eleven DNG opcodes (`src/shootflow/dng_opcodes.py`). Several of them were written
on 2026-11-12 by sessions that could not fetch the DNG specification: the WarpFisheye note says
its formula is "the specification's as this session knew it", and the module docstring listed
"choices the specification leaves open". This session found the specification reachable:

    https://helpx.adobe.com/content/dam/help/en/photoshop/pdf/DNG_Spec_1_7_1_0.pdf

(Digital Negative Specification 1.7.1.0, September 2023, 1,176,100 bytes, HTTP 200 from a cloud
session; the 1.7.0.0 PDF at the same path with `1_7_0_0` answers too). It was read with
`pdftotext -layout`, chapter 6 ("Opcode List Processing"), pages 105-122. Not committed: the PDF
is Adobe's.

## What was compared

For each opcode the module runs, the parameter layout (field order and types) and the processing
formula, against the text.

| opcode | layout | formula | verdict |
| --- | --- | --- | --- |
| 1 WarpRectilinear | N; per set kr0..kr3, kt0, kt1 (DOUBLE); cx, cy | `f = kr0 + kr1 r^2 + kr2 r^4 + kr3 r^6`; `x' = cx + m (f dx + kt0 2 dx dy + kt1 (r^2 + 2 dx^2))`, y likewise with kt0/kt1 swapped | match, apart from the centre and `m` (below) |
| 2 WarpFisheye | N; per set kr0..kr3; cx, cy | `theta = atan(r)`, `f = (kr0 theta + kr1 theta^3 + kr2 theta^5 + kr3 theta^7) / r`, `x' = cx + m f dx` | match: the formula written from memory on 2026-11-12 is the text's, apart from the centre and `m` |
| 3 FixVignetteRadial | k0..k4, cx, cy | `g = 1 + k0 r^2 + k1 r^4 + k2 r^6 + k3 r^8 + k4 r^10` | match, apart from the centre and `m` |
| 4 FixBadPixelsConstant | Constant, BayerPhase (LONG) | phases 0-3: top-left red, green in a green/red row, green in a green/blue row, blue | match |
| 5 FixBadPixelsList | BayerPhase, BadPointCount, BadRectCount; points (row, column); rects (top, left, bottom, right) | - | match |
| 6 TrimBounds | top, left, bottom, right | crop to the rectangle | match |
| 7 MapTable | area (8 LONG), TableSize, SHORT entries | 16-bit LUT | match; the index rule (`floor(x 65535 + 0.5)`) is not in the text, it is the SDK's, as the README says |
| 8 MapPolynomial | area, Degree (at most 8), Degree + 1 DOUBLE, constant first | polynomial | match |
| 9 GainMap | area, MapPointsV/H, MapSpacingV/H, MapOriginV/H (DOUBLE), MapPlanes, FLOAT gains rows then columns then planes | bilinear inside the map, edge-replicated outside; relative coordinates, 1.0 = image height or width; a plane past MapPlanes uses the last | match |
| 10-13 Delta/ScalePerRow/Column | area, Count, FLOAT per row or column | Count must match the affected rows or columns | match |
| 14 WarpRectilinear2 | N; per set kr0..kr14, kt0, kt1, min/max valid radius; cx, cy; reciprocalRadial (LONG) | `r_real = r_ideal f(clamp(r))` or `r_ideal / f(clamp(r))`; skip rule | not on main yet: PR #15290 (another session, same day) adds it from the same text |

## The one difference: where the centre and `m` are measured from

The text defines, for WarpRectilinear, WarpFisheye and FixVignetteRadial alike:

    cx = x0 + cx_hat (x1 - x0)        mx = max(|x0 - cx|, |x1 - cx|)
    cy = y0 + cy_hat (y1 - y0)        my = max(|y0 - cy|, |y1 - cy|)        m = sqrt(mx^2 + my^2)

with `(x0, y0)` and `(x1, y1)` "pixel coordinates of the top-left [and bottom-right] pixel". Its
examples: `(0.5, 0.5)` is the image centre, `(1, 0)` is "the top-right pixel". So `m` is "the
distance (in pixels) from the optical center to the farthest pixel".

The module measured both from the image's edges instead: centre at `cx_hat * w` with pixel `x`
at `x + 0.5`, and `m` to the corner point `(w, h)`. It called this a choice the specification
leaves open. The text does not leave it open. Now `_spec_frame` returns the text's centre
(`cx_hat (w - 1)`, plus the module's half-pixel offset) and its `m`. The three opcodes and
WarpRectilinear2 share it, through `_warp_frame` and `_vignette_frame`.

How much it moved, on the Leica T's own WarpRectilinear terms over a 4944 x 3278 frame (every
103rd column and 97th row, plus the four corners):

| optical centre | largest source-point shift |
| --- | --- |
| (0.5, 0.5) | 0.048 px |
| (0.48, 0.53) | 0.048 px |
| (0.4, 0.6) | 0.048 px |

A FixVignetteRadial with `k0 = -0.3, k1 = 0.05` changes gain by at most 0.012% (relative). Both
are below what any check so far can see. Adobe's SDK may still differ from the text in its own
code. No Adobe render has been compared, and the SDK source was not read.

## Checks

- `tests/test_dng_warp.py`, `tests/test_dng_warp_fisheye.py`, `tests/test_dng_vignette_poly.py`:
  the independent "specification" helpers in the tests now use the text's centre and `m`, in
  pixel-index coordinates (`(x - cx) / m`, no half-pixel offsets). The module, which keeps its
  `x + 0.5` coordinates, passes them to 1e-9 (source points) and 1e-12 (gains).
- New `test_centre_and_m_are_the_specifications`: with optical centre `(1, 0)` the top-right
  pixel reads itself; with `f = 1 + r^2` the farthest pixel from the middle reads from exactly twice
  its offset; a vignette `k0 = 0.3` gives gain 1.3 at the corner pixel.
- The camera's own render, re-run (`tools/warp_preview_check.py` on the Leica T, as in
  `eval/warp-rectilinear-2026-11-12.md`): 444 patches, median radial shift +0.18 px with the warp
  on (unchanged), mean |radial| 0.32 (unchanged). Per-band p90 moved by 0.09 at most (0.3-0.4:
  0.82 to 0.90; 0.7-0.8: 1.11 to 1.02). The preview cannot resolve a 0.05 px change, so this
  shows nothing regressed. It does not show the new convention is better.
- Full photo-editing suite, both engines (`platform/ci/run_venture_tests.py photo-editing`).

## Smaller notes from the text

- "N must be 1 or the total number of image planes" (both warps). The module accepts any N and
  gives a plane past N the last set. That is lenient, not wrong, for any file that obeys the rule.
- WarpRectilinear's `w(r) = kr0 r + kr1 r^3 + kr2 r^5 + kr3 r^7` and WarpFisheye's `w(r)` "must
  be an increasing function". The module does not check this. A file that breaks it gets folded
  geometry, as the text implies.
- "It is recommended that implementations use a suitable resampling kernel, such as a cubic
  spline." The module samples bilinearly (named in the docstring as before).
- GainMap places a pixel at `y / h` of the height. The text's "relative coordinates, where 1.0
  is equal to the height" does not say whether a pixel's position is its index or its centre.
  That stays as the SDK-based choice the docstring names.

## Reproduce

    curl -LO https://helpx.adobe.com/content/dam/help/en/photoshop/pdf/DNG_Spec_1_7_1_0.pdf
    pdftotext -layout DNG_Spec_1_7_1_0.pdf spec.txt    # chapter 6: grep -n "Opcode ID" spec.txt
