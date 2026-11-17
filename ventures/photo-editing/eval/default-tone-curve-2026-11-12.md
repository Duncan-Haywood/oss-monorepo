# The default tone curve, identified and fitted (2026-11-12)

The question left by `eval/tone-curve-2026-11-12.md`: 68 of RawTherapee's 161 camera profiles
share one 8,192-point ProfileToneCurve. What is it, and should shootflow use it for profiles
that carry no curve?

## 1. What the shared curve is

RawTherapee's `rtengine/dcp.cc` (GPL; read at run time, not copied) holds
`adobe_camera_raw_default_curve`, 1,025 values, and applies it to any profile with no
ProfileToneCurve whose `ProfileToneCopyright` contains "Adobe Systems" ("An Adobe profile
without tone curve is expected to have the Adobe Default Curve"). The same table is the DNG
SDK's `dng_tone_curve_acr3_default`.

| curve in the profiles (RawTherapee `rtdata/dcpprofiles`, 161 files) | profiles | ProfileToneCopyright |
|---|---|---|
| 8,192 points | 68 | "Copyright Maciej Dworak" 63, "Maciej Dworak" 4, "Copyright Dr Slony" 1 |
| 2 points (straight line) | 53 | "public domain" 46, "RawTherapee CC0" 7 |
| 1,025 points | 2 | "RawTherapee", "RawTherapee CC0" |
| 96 points | 3 | DCamProf-generated 2, none 1 |
| none | 35 | none 34, "RawTherapee CC0" 1 |

Against the 1,025-entry table read linearly (4,097 even points):

| profile | worst linear difference | worst in 8-bit sRGB steps | inputs evenly spaced |
|---|---|---|---|
| Canon EOS 1300D (8,192 points) | 4.5e-7 | 7e-5 | yes (3e-8) |
| Canon EOS 100D, Canon EOS RP (1,025 points) | 9.2e-6 | 0.03 | exactly |

So the 68 profiles embed Adobe's default curve resampled. No profile in the set has an Adobe
tone copyright, so RawTherapee's rule changes none of them; it matters for Adobe-made profiles
(Adobe DNG Converter, Adobe Standard `.dcp` files) and DNGs whose embedded profile omits the
curve.

## 2. A fit of our own

The table is not copied into shootflow. `tools/default_tone_fit.py` fits a natural cubic
spline (the DNG specification's interpolation, the code that already reads profile curves)
with fixed knot inputs `(i / (K - 1)) ** p`, solving for the knot outputs by least squares
weighted by the sRGB curve's slope (capped at 50), so the error is minimised in output steps.
Knot positions and outputs rounded to 6 decimals.

| knots K | p = 2.25 | 2.5 | 2.75 | 3.0 | (worst 8-bit sRGB step) |
|---|---|---|---|---|---|
| 20 | 0.190 | 0.176 | **0.077** | 0.103 | |
| 22 | 0.192 | 0.136 | 0.091 | 0.107 | |
| 24 | 0.170 | 0.070 | 0.107 | 0.064 | |
| 28 | 0.110 | 0.086 | 0.047 | 0.121 | |

Evenly spaced knots are far worse (20 knots: 5.1 steps, the toe is missed). Chosen: K = 20,
p = 2.75. Worst linear error 5.07e-4; worst 0.077 of an 8-bit step; 0.18 goes to 0.38805
(curve 0.38809); table non-decreasing. Fitted from the 1,025-point profile instead, the same
knots are 0.0775 steps away. `tools/default_tone_fit.py` reproduces the shipped knots exactly
from `Canon EOS 1300D.dcp` (`matches_shipped_knots: true`), in under a second.

## 3. When it applies

`DevelopSettings.default_tone` / `--default-tone-curve`:

- `auto` (default): only when the profile has no ProfileToneCurve and its ProfileToneCopyright
  names Adobe (RawTherapee's rule, conservative: renders of non-Adobe curve-less profiles are
  unchanged by this release);
- `always`: whenever the profile has no curve (Adobe's converters' behaviour as RawTherapee
  describes it; not checked against an Adobe render here);
- `never`.

A profile's own curve, including a straight line, always wins. `--no-tone-curve` and
`--no-profile-tables` switch the default off as well.

## 4. Tests

`tests/test_default_tone_curve.py`, 12 tests (11 without the environment variable): knots
valid and table non-decreasing; landmarks 0.01/0.05/0.18/0.5/0.9 within 6e-4; renders for
auto (Adobe and non-Adobe copyright), always and never, against the plain render toned by hand
within 0.004 linear; profile curve and straight line win; after a hue/saturation map; off
switches; a `.dcp` with an Adobe copyright and no curve; a bad mode raises; numpy
byte-identical to pure Python in four settings. With
`SHOOTFLOW_DEFAULT_TONE_DCP="rt/rtdata/dcpprofiles/Canon EOS 100D.dcp"` the point-by-point test
passes too.

## 5. A real frame

rawpy's `RAW_CANON_5DMARK2_PREPROD.CR2`, written to DNG by `tools/libraw_differential.py
--keep`, half size (2817x1876), with RawTherapee's `Canon EOS 5D Mark II.dcp` (HueSatMap
90x30x1). `PYTHONPATH=src python3 eval/default_tone_frame.py 5d2.dng "Canon EOS 5D Mark
II.dcp" "Canon EOS 6D.dcp"`:

| | no curve | ACR3 curve (8,192 points, from the 6D profile) | default, 20-knot fit |
|---|---|---|---|
| mean level (8-bit) | 26.01 | 29.56 | 29.56 |
| p5 / p50 / p95 | 0.0 / 14.0 / 95.8 | 0.0 / 9.7 / 132.9 | 0.0 / 9.7 / 133.0 |
| numpy seconds | 4.5 | 6.2 | 6.4 |

Fit against curve: mean 0.014 8-bit steps, p99 0.68, max 0.81; 1.3% of channel values differ
by more than half a step, none by a whole step. The curve against none: mean 6.9, max 205.
The per-pixel gap is larger than the curve-level 0.077 because saturated colours go through
the RGB tone in ProPhoto and then the matrix to sRGB, which amplifies small differences in
the brightest and darkest channel.

## Not shown

Whether `always` matches what Lightroom or Adobe Camera Raw produce for a curve-less
profile: that needs an Adobe render of a known frame, as before.
