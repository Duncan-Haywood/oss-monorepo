# Lateral colour from lensfun, composed into the WarpRectilinear2 (2026-11-13)

Follow-up to `eval/lensfun-correction-2026-11-13.md` (distortion from lensfun's database for raws
that carry no correction). That slice corrected geometry only; lensfun's TCA calibrations were left
as the next item. This adds them, and reads Canon's maker-note lens name.

## Lensfun's TCA, from its source

Read from lensfun master `libs/lensfun/mod-subpix.cpp`, `lens.cpp` and `modifier.cpp` (fetched
2026-11-13 from raw.githubusercontent.com), not from memory:

| What | lensfun | Here (`lens_profiles.py`) |
|---|---|---|
| Models | `poly3`: `R_d = R_u (b R_u^2 + c R_u + v)` per red and blue (`ModifyCoord_TCA_Poly3`); `linear`: `R_u k` | `Tca(model, (vr, vb, cr, cb, br, bb))`; linear stored as `v` with `b = c = 0` |
| XML defaults | `vr`, `vb` default 1, the rest 0 | the same |
| Units | `rescale_polynomial_coefficients` (TCA): `c *= hugin_scaling`, `b *= hugin_scaling^2`, Hugin `R = 1` at the calibration's half height | `f_T(R) = v + c R + b R^2` with `R = s q`, `s` = the module's `hugin_scale` of the TCA set |
| Order | `ApplySubpixelGeometryDistortion`: coordinate callbacks (scale, then distortion) run first, then subpixel (TCA) callbacks on the distorted point; green is not moved | plane factor `F(r) = f_D(r) f_T(s r f_D(r))`; green is `f_D` alone |
| Focal length | `InterpolateTCA`: nearest crop at least 0.96 of the camera's; two nearest calibrations either side, Hermite (`_lf_interpolate`); `__parameter_scales`: TCA terms 0 and 1 (`v`) not scaled, the rest multiplied by focal length before and divided after | `interpolate_tca` |

`f_D` is a polynomial of degree 3 (ptlens, poly3) or 4 (poly5) in `r`; `q = r f_D` has degree at
most 5; `f_T(q)` has degree at most 10; `F` at most 14. A WarpRectilinear2 plane holds `kr0..kr14`,
so the composition is exact. The fill zoom divides `r` by `k` (`kr_p / k^(p+1)`), still exact; `k`
is now the largest of the three planes' fill zooms, so no plane reads from outside the frame.

## Checked

- `tests/test_lens_tca.py`, 12 tests. A test XML with made-up numbers; `lensfun_rgb_source` writes
  lensfun's pipeline out in its own coordinates (normalised by `NormScale` with a real focal length
  that cancels, scale callback, distortion with the `d` rescale, then TCA). The module's warp lands
  within 1e-7 px of it for ptlens + poly3 TCA at an interpolated focal length with a camera crop
  bigger than the calibration's, with the fill zoom, and poly5 + linear TCA on a 4:3 portrait-ish
  frame. Interpolation is checked against the Hermite written out with `v` unscaled. The fill keeps
  all three planes inside. `develop` with the lens database gives the same bytes as the same
  three-plane warp written into the DNG's OpcodeList3, on both engines, and differs with
  `--no-lens-tca`.
- Seeded faults, each run against the 12 tests: TCA applied to the undistorted point (2 fail); `v`
  scaled by focal length while interpolating (1 fails); `b` scaled by `s` instead of `s^2` (2
  fail); fill zoom from the green plane only (1 fails).
- `tools/lensfun_tca_check.py` on lensfun's whole database (53 `data/db` files, fetched
  2026-11-13): 909 lenses carry TCA with a distortion calibration; at every TCA focal length and
  every midpoint (6,257 cases: ptlens + poly3 5,697, poly3 + poly3 550, poly5 + poly3 5, ptlens +
  linear 4, poly3 + linear 1), the largest gap from lensfun's pipeline at the corners, edge
  midpoints and 10 random pixels, all three planes, is **2.7e-12 px**. 1.7 s.
- What the correction is worth: on a 6000 px wide frame at the calibration's crop, red and blue
  read from points a median **0.56 px** apart at the corner; 90th percentile 1.89 px, 99th 3.93 px,
  largest 9.9 px; **over 1 px in 30.0%** of cases and over 2 px in 8.9%. Those are the fringes a
  file with no correction keeps.

## Canon maker-note lens name

Canon bodies before EXIF 2.3 write no `LensModel` (0xA434). Their maker note's tag 0x0095 holds the
lens name. On the three real CR2s in the earlier evals: the 5D Mark II (rawpy's test file) gives
`EF50mm f/1.2L USM`, which now finds lensfun's `Canon EF 50mm f/1.2L USM` with no `--lens` (that
lens has no TCA calibration, so it gets distortion only). The 7D gives `10-17mm`, which
`specific()` refuses as numbers only (no Canon-mount 10-17 mm is in lensfun anyway; the lens ID,
160, is ambiguous between third-party lenses). The 350D gives no name and lens ID 65535. The reader
hands the name on as the EXIF IFD's `LensModel` only when EXIF has none. Tested on a synthetic CR2
with and without the tag (`tests/test_lens_tca.py`).

## Not checked

- A real frame with sharp edges in the corners, to see that the fringes go (and how close lensfun's
  TCA is to that copy of the lens).
- Lensfun's `acm` TCA model: not in the database files read here.
- Vignetting (`pa`): the next lensfun item.
