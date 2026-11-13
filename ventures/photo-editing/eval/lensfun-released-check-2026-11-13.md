# The lensfun port against the real lensfun library, and a bug in lensfun 0.3.4 (2026-11-13)

## Why

`lens_profiles` (PR #15302) ports lensfun's distortion correction from its C++ source, and its tests
check it against lensfun's pipeline as written out again in the test. That shows the port does what
its author read. It does not show the reading was right. This check runs lensfun's own compiled
code instead.

## How

lensfunpy (`pip install lensfunpy`, MIT; 1.18.0) bundles **liblensfun 0.3.4**, lensfun's latest
release, and that release's database (1,304 lenses). `tools/lensfun_released_check.py` picks every
rectilinear lens there with a ptlens, poly3 or poly5 calibration that `lens_profiles.load_db` reads
from the same files and finds by the same name. It tries:

- each calibrated focal length, and the midpoint between each pair of neighbours (where lensfun
  interpolates);
- a 3:2 and a 4:3 frame, 1,200 px wide;
- the calibration's own crop factor and 1.5 times it.

Each case asks `Modifier.apply_geometry_distortion` (distortion only, scale 1) where each pixel reads
from. It compares that with `dng_opcodes.warp_source` on the WarpRectilinear2 that
`lens_profiles.build_warp(..., fill=False)` makes, over 7 rows and one pixel quad in four along each
row.

**Two conventions, one exact identity.** `lens_profiles` follows lensfun's master branch (0.4,
unreleased). Master divides the ptlens and poly3 terms by `d` (`1 - a - b - c`, or `1 - k1`), so the
centre keeps its scale. The 0.3 release keeps Hugin's formula as calibrated. The two also measure a
pixel slightly differently: master by `hypot(W, H)` (`modifier.cpp`, `NormScale`), 0.3 by
`hypot(W - 1, H - 1)` (v0.3.4 `modifier.cpp`, `coordinate_correction`). Call those `sm` and `s3`,
Hugin units per pixel, and let `P` be the Hugin factor. Then 0.3 sends output radius `R` to
`R P(s3 R)`, and master sends it to `R P(sm R / d) / d`. So exactly:

    source_0.3(p) = c + (sm / s3) (source_master(c + (s3 d / sm)(p - c)) - c)

The check builds the left side from our warp, reading the polynomial past `r = 1` at the corners (the
identity's radius is `d` times larger), and compares it with lensfun 0.3.4. The same identity, with
v0.3.4's pipeline written out step by step, holds to 1e-9 px in `tests/test_lensfun_released.py`.

## A bug in lensfun 0.3.4's SSE code

The first comparison was off by 0.05-0.3 px, and the error did not behave like a formula error.
Lensfun's own output was not symmetric about the centre of a symmetric frame (corner y 2.590 against
2.570 on a 600 x 400 frame). An even-only profile (`a = c = 0`), which needs no square root, came out
worse than one with odd terms.

The cause is in `libs/lensfun/mod-coord-sse.cpp` at tag v0.3.4, in both `ModifyCoord_Dist_PTLens_SSE`
and `ModifyCoord_Dist_Poly3_SSE`:

    __m128 x = _mm_shuffle_ps (c0, c1, _MM_SHUFFLE (2, 0, 2, 0));   // x0 x1 x2 x3
    __m128 y = _mm_shuffle_ps (c0, c1, _MM_SHUFFLE (3, 1, 3, 1));   // y0 y1 y2 y3
    ... poly3 computed per pixel: p0 p1 p2 p3 ...
    _mm_store_ps (&iocoord [8 * i], _mm_mul_ps (poly3, c0));        // x0*p0 y0*p1 x1*p2 y1*p3
    _mm_store_ps (&iocoord [8 * i + 4], _mm_mul_ps (poly3, c1));    // x2*p0 y2*p1 x3*p2 y3*p3

The factor is computed in pixel order but multiplied lane by lane into the interleaved `(x, y)`
registers. So only the x of pixel 4k and the y of pixel 4k+3 get their own pixel's factor. The other
six coordinates of each quad take a factor from up to three pixels away. Re-running lensfun's formula
in Python with that lane mix reproduces liblensfun's output to 0.003-0.011 px at 600 x 400. The
plain formula is up to 0.09 px off it. What is left is float32 and the approximate square root
`_mm_rcp_ps(_mm_rsqrt_ps(r2))`. The error does not shrink at higher resolution. Neighbouring pixels
sit closer in radius, but each coordinate is larger, so the two cancel.

On lensfun's master branch the same functions multiply `x` and `y` by the factor first and
interleave after (`_mm_unpacklo_ps`, `_mm_unpackhi_ps`), so it is fixed there. It is not fixed in any
release: 0.3.4 is the latest. The SSE path runs on x86 when a row's buffer is 16-byte aligned; ARM
builds, and rows that are not aligned, take the plain C code, which is right. poly5 has no SSE loop.
Programs that link the system lensfun 0.3.4 on x86 get this error. How large it is on the whole
database is in the table below. Which programs those are depends on each distribution's build, and
that was not checked here.

So the check reports two gaps per case. "Own lanes" compares only the coordinates lensfun computes
with their own factor (all of them for poly5), and checks the port. "Every coordinate" includes the
mixed lanes, and for ptlens and poly3 measures the bug as shipped.

## Results

Run on 2026-11-13: 36,756 cases over 1,083 lenses, frame 1,200 px wide, about 19 minutes. 191
lens and focal combinations were skipped: lenses whose names appear more than once, and cases where
lensfun applied no distortion. Largest gap in each case, in pixels:

| model | cases (interpolated) | own lanes: p50 | p90 | p99 | max | every coordinate: p50 | p90 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| ptlens | 31,656 (14,112) | 0.0084 | 0.022 | 0.062 | 2.70 | 0.044 | 0.13 | 0.32 | 2.75 |
| poly3 | 5,064 (2,084) | 0.0054 | 0.0071 | 0.0094 | 0.0099 | 0.027 | 0.075 | 0.16 | 0.61 |
| poly5 | 36 (16) | 0.0063 | 0.0086 | 0.0089 | 0.0089 | (no SSE loop: same) | | | |

**The 90 own-lane cases over 0.1 px have two causes, both lensfun's.**

- **24 are duplicate calibrations.** Five lenses list the same focal length twice with different terms.
  One is the Panasonic DMC-FZ28 (Standard), at 8.2 mm. Lensfun 0.3.4 keeps the last entry
  (`_lf_addobj` with `cmp_distortion`, which compares only the focal length, replaces the earlier
  one). Master keeps both and its exact-match loop returns the first. `lens_profiles` follows master,
  so these differ by design: up to 2.7 px.
- **66 are lensfun's approximate square root.** They are lenses with large `a` and `c` terms, such as
  the Sigma 17-50mm f/2.8 at 17 mm (`a = 0.236, c = 0.275`). Only those two terms use `r`, and in the
  SSE loop `r` is `_mm_rcp_ps(_mm_rsqrt_ps(r2))`, two estimates each good to 1.5 x 2^-12. The
  largest error that can cause is `R rho |3 a rho^2 + c| x 3 x 2^-12` px. That is 2.4 px for this
  Sigma, where the gap is 0.40 px. All 66 cases are within that bound, the largest at 39% of it.

Leaving out the five duplicate-focal lenses, the largest own-lane gap is 0.40 px on ptlens and 0.0099
px on poly3, against medians of a hundredth of a pixel. No case points to an error in the port.

**The bug as shipped.** On the mixed lanes, lensfun 0.3.4 puts the correction 0.044 px off at the
median case, 0.32 px at p99 and up to 2.2 px for ptlens (the Sigma 17-50mm at 17 mm, duplicates left
out). For poly3 it is 0.16 px at p99 and 0.61 px at most. Those are distances on a frame 1,200 px
wide. The error is a mixed-up neighbour factor, so it is about the same in pixels at any resolution.

## What this does and does not show

- It shows `lens_profiles` picks the same calibration as lensfun, interpolates it the same way
  (`term x focal` through `_lf_interpolate`) and applies the same geometry, up to lensfun's own
  float32 and SSE noise. This covers every rectilinear ptlens, poly3 and poly5 lens in lensfun
  0.3.4's database, at both crop factors and both aspect ratios.
- It checks master's `1 / d` convention only through the identity above. lensfunpy has no build of
  master. The identity is exact algebra, and its master side matches master's pipeline written out
  (PR #15302's tests, 1e-7 px).
- Not checked: lens matching by name (the check pairs lenses by their exact database name), the fill
  zoom, lensfun's version 2 database (0.3.4 reads version 1), and TCA and vignetting, which neither
  module applies yet.

## Run it

    pip install lensfunpy numpy
    python3 tools/lensfun_released_check.py --width 1200 --json out.json
    PYTHONPATH=src:tests python3 -m pytest tests/test_lensfun_released.py
