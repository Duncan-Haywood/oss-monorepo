# DNG-spec colour model, checked (2026-11-12)

What changed: `shootflow develop` and the pipeline's grade stage now render colour by the
DNG specification's model (`src/shootflow/dng_colour.py`, README "Colour for the light the
photo was taken in"). The earlier method, one matrix nearest D65 and white balance in camera
space (dcraw, LibRaw), stays as `--colour dcraw`.

## 1. Synthetic scenes with a known answer (`tests/test_dng_colour.py`, 15 tests)

The test writes DNGs from a camera whose true response under Standard Illuminant A differs
from its response under D65 (two different 3x3 matrices), photographing six patches lit by
that light. Expected output: the patches adapted to the sRGB white.

| Scene | DNG model, worst error (linear) | dcraw model |
|---|---|---|
| tungsten (A), two matrices | 0.0004 | 0.036 |
| tungsten, ForwardMatrix carries the response, colour matrices a crude daylight fit | < 0.01 | without FM: 0.022 |
| daylight (D65) | < 0.01 | (same as before) |

Also covered: greys neutral at three whites between the illuminants, `AsShotWhiteXY` within
0.003 of the `AsShotNeutral` render, `AnalogBalance` taken out, `CameraCalibration` used only
with matching signatures (and a note when not), one matrix, unknown illuminants, a `--wb`
override setting the white (2856 K found back), unknown model refused. The existing 18
developer tests pass unchanged apart from the matrix name; the numpy engine stays
byte-identical (`tests/test_raw_develop_engines.py`, run in a venv with numpy).

## 2. Against colour-hdri (`tools/dng_colour_check.py`)

colour-hdri 0.2.6 with colour-science 0.4.7, in a separate venv. Random profiles: an A and a
D65 matrix each jittered up to 15% around real-camera shapes, `CameraCalibration` pairs in
half the cases, `AnalogBalance` in half, `ForwardMatrix` pairs in every other case; whites
2,000-10,000 K with Duv within ±0.006. Seed 1, 2,000 cases:

| | ColorMatrix path (1,000) | ForwardMatrix path (1,000) |
|---|---|---|
| white vs the white the neutral was made from | 9e-16 | 2 cases off (below); rest 1e-15 |
| white vs colour-hdri | 1.6e-8 | 2 cases off (below); rest < 1e-8 |
| CCT vs colour-hdri | 1.8e-12 K | 1.8e-12 K |
| camera-to-XYZ D50 matrix vs colour-hdri | 1.6e-14 | 8.5e-14 |
| colour-hdri loop not settled in 2 s | 0 | 1 |

The two odd cases (1229 and 1239, both with jittered ForwardMatrix pairs) are profiles with
several self-consistent whites: plotted over the blend weight, the self-consistency gap
crosses zero three times. colour-hdri starts its loop at (1/3, 1/3), ours at D50, and they
settle on different crossings (0.04 and 0.03 apart in xy); colour-hdri's stopping test
(|change in x + change in y| <= 1e-10) can also stop while still moving. Neither landed on
the white the case was built from in those two. Given a white, the matrices agree to 1e-13
in every case. The jitter (up to 15% per entry) is wider than real camera pairs differ, and
the real 350D profile below has a single crossing; the tool counts these cases and fails if
they exceed 0.5%.

Robertson CCT agrees to rounding (both use the Wyszecki and Stiles table with Lindbloom's
correction).

Found on the way, three fixes before the numbers above:

1. The plain fixed-point iteration took 20 to 226 steps on 37 of 400 profiles. The first
   version capped it at 30 steps and averaged, leaving the white up to 0.0015 off in xy.
   Ours now iterates on the blend weight and, after 100 steps, brackets and bisects.
2. A bisection-only version found a different self-consistent white than the iteration on
   three multi-crossing profiles; iterating first, as the specification does, and bisecting
   only when it stalls brought that to the two cases above.
3. A guard bounding Bradford's cone ratios to [0.1, 10] changed the matrix for whites near
   2,000 K (blue ratio over 10) by up to 1.6 against colour-hdri; the specification has no
   such bound, so it went. A non-positive cone response is now refused instead.

The tool gives colour-hdri's loop two seconds per case and counts the ones that do not settle.

## 3. A real camera profile (`--dng`)

exiftool's test image `t/images/DNG.dng` (from github.com/exiftool/exiftool, downloaded at
run time, not committed): written by Adobe's converter from a Canon EOS 350D, image data
stripped, colour tags intact.

| | |
|---|---|
| ColorMatrix1 / 2 | Standard A / D65 |
| CameraCalibration1 | diag(1.0069, 1, 1.0027), no signature |
| AsShotNeutral | 0.5924, 1, 0.5017 |
| white found | x 0.401414, y 0.390456 (colour-hdri: same to 6 places) |
| CCT | 3584.5 K, so 63.8% ColorMatrix1 |
| matrix vs colour-hdri | 1.8e-15 |
| dcraw model vs DNG model, 64 patches | max 35.5, mean 9.1 8-bit steps; 59 over 2 steps |

The last row is a difference between models on a real camera's profile, not an accuracy
score: which is closer to the scene needs a tungsten-lit chart with known colours.

## Not done

A camera- or Adobe-written DNG with `ForwardMatrix` (the 350D file has none), DNG 1.6
`ColorMatrix3` and `IlluminantData`, profile `HueSatMap`/`LookTable`, and a real chart.

Reproduce:

    uv venv /tmp/v && VIRTUAL_ENV=/tmp/v uv pip install numpy colour-hdri
    /tmp/v/bin/python tools/dng_colour_check.py --cases 2000
    curl -sSo /tmp/DNG.dng https://raw.githubusercontent.com/exiftool/exiftool/master/t/images/DNG.dng
    /tmp/v/bin/python tools/dng_colour_check.py --dng /tmp/DNG.dng
