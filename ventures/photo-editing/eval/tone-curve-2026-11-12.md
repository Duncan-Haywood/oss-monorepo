# The profile tone curve, checked (2026-11-12)

What changed: in the default `dng` colour model, `shootflow develop` now applies a camera
profile's `ProfileToneCurve` (DNG 1.2 onwards), from the DNG itself or from a `.dcp` passed
with `--dcp`. It runs after the look table, in linear ProPhoto, before the matrix to sRGB and
the sRGB curve. `--no-tone-curve` skips it; `--no-profile-tables` skips it with the tables.
Code: `dng_colour.ToneCurve`, `natural_spline_slopes` and `rgb_tone`;
`raw_develop._tone_curve`; `raw_develop_np.rgb_tone`.

How it is applied, following the DNG specification ("interpolated using a cubic spline",
points in linear gamma from (0, 0) to (1, 1)) and the behaviour of Adobe's reference code:

- **Spline:** the natural cubic spline (C2, second derivative zero at both ends), solved as a
  tridiagonal system on the knot slopes and evaluated as cubic Hermite segments. Sampled at
  4,096 even steps and read with linear interpolation, input clamped to [0, 1].
- **Hue-preserving RGB tone:** the largest and smallest channel go through the curve; the
  middle one becomes `lo' + (hi' - lo') * (mid - lo) / (hi - lo)`. HSV hue is unchanged. With
  the two smaller channels equal, both take the curve's value.
- A curve that does not start at (0, 0), end at (1, 1), increase in x, or stay in [0, 1] is
  skipped with a note; a straight-line curve is reported as the identity and changes nothing.

## 1. Synthetic (`tests/test_dng_tone_curve.py`, 14 tests)

- Spline against a second implementation written in the test (second-derivative form,
  dense Gaussian elimination; no shared code): 200 random curves of 2-40 points, 50 points
  each, worst difference under 1e-9. Against scipy's `CubicSpline(bc_type="natural")`: same.
- The table reads the spline within 1e-6; it passes through every knot; two points is a line.
- `rgb_tone` on 5,000 random colours (a fifth with two channels tied): the largest and
  smallest output equal the curve at the largest and smallest input, HSV hue unchanged
  within 1e-9; greys go through the curve.
- Renders: a DNG with an S curve comes out as the no-curve render toned by hand within 0.004
  linear; with a hue/saturation map as well, the curve comes after the map; `tone_curve=False`
  and `profile_tables=False` give the plain bytes; the tables still apply with the curve off;
  identity and malformed curves change nothing; a `.dcp` gives the same bytes as the same tags
  embedded.
- Engines: numpy's `rgb_tone` gives the same floats as pure Python on 4,000 random colours
  plus every tie pattern of {0, 0.25, 0.5, 1}; whole renders byte-identical with half size and
  positive and negative exposure.

The suite: 603 passed, 1 skipped, 1 failure that predates this change
(`test_workspace_health.py::test_unreadable_render_input_is_reported_for_review` fails on
`main` too when run as root, which can read a chmod-000 file).

## 2. 161 real camera profiles (`tools/dcp_check.py`)

RawTherapee's `rtdata/dcpprofiles` (GPL repository, sparse clone at run time, not committed).
`PYTHONPATH=src python3.13 tools/dcp_check.py rt/rtdata/dcpprofiles --samples 2000`, 31 s.

| | |
|---|---|
| profiles carrying a ProfileToneCurve | 126 of 161, all load |
| curve kinds | 68 share one 8,192-point curve; 53 straight lines (2 points); 2 of 1,025 points (same shape as the 68 at mid-grey); 3 of 96 points |
| tables non-decreasing | 126 of 126 |
| spline vs scipy natural spline | worst 3.3e-16 |
| table vs spline | worst 2.8e-6 |
| linear 0.18 goes to | median 0.388 (range 0.180-0.438); slope there median 2.13 |
| worst hue change through the RGB tone (2,000 colours x 126) | 5.7e-14 degrees |
| numpy vs pure Python | 0 mismatching colours |

The shared 8,192-point curve, sampled: 0.01 -> 0.0083, 0.05 -> 0.0771, 0.18 -> 0.388,
0.5 -> 0.805, 0.9 -> 0.983. A slight toe in the deep shadows, a strong lift and steepening
through the mid-tones, a shoulder in the highlights.

**Why hue-preserving matters, measured:** the same curve applied to each channel separately
turns the hue of saturated colours (ProPhoto, s 0.3-0.9, v 0.05-0.8, 20,000 colours) by a mean
3.8 degrees, p95 10.0, worst 15.5. The RGB tone turns them by at most 8e-14.

## 3. A real raw frame

rawpy's `RAW_CANON_5DMARK2_PREPROD.CR2`, written into a DNG by
`tools/libraw_differential.py --keep`, developed at half size (2817x1876) with RawTherapee's
`Canon EOS 5D Mark II.dcp`. That profile's own curve is a straight line, so the run below takes
the shared 8,192-point curve from `Canon EOS 6D.dcp` (`eval/tone_frame.py --tone-from`); the
matrices and maps are the 5D Mark II's.

| | tables only | tables + tone curve |
|---|---|---|
| numpy time | 3.4 s | 4.8 s |
| mean level (8-bit) | 26.0 | 29.6 |
| p5 / p50 / p95 | 1.6 / 14.5 / 78.2 | 1.1 / 12.5 / 100.0 |
| clipped pixels | 0.07% | 0.38% |

Tone against tables only: mean 6.9 8-bit steps, p99 56.6, max 204.6, 37% of pixels move more
than 5 steps. The frame is dark, so most pixels sit in the curve's toe (p50 falls) while the
mid-tones and highlights rise (p95 rises by 22 steps). The pure-Python engine gives the same
bytes as numpy for the whole frame (40.3 s).

What this does not show: whether the toned render is closer to what Adobe Camera Raw or
Lightroom produce with the same profile. That needs an Adobe render of a known frame.
