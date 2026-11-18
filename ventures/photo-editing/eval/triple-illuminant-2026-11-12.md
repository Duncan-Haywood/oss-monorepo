# DNG 1.6 triple-illuminant profiles, checked (2026-11-12)

What changed: `shootflow develop` (the default `dng` colour model) reads the DNG 1.6 tags for a
third calibration illuminant, from the DNG or a `.dcp`: `CalibrationIlluminant3` (52529),
`CameraCalibration3` (52530), `ColorMatrix3` (52531), `ForwardMatrix3` (52532),
`ProfileHueSatMapData3` (52537), and `IlluminantData1/2/3` (52533-52535) for an illuminant
coded 255 ("other"). Code: `dng_colour.triple_weights`, `temperature_tint`,
`xy_from_temperature_tint`, `illuminant_xy`, `parse_illuminant_data`, `spectrum_to_xy`,
`Profile.tags_for_white`, `Profile.hue_sat_map_for_white`, `cie1931.py`;
`raw_develop._profile`.

## How three illuminants are blended

The DNG specification leaves the blending to the reader; this follows the method of Adobe's
DNG SDK (`CalculateTripleIlluminantWeights` in `dng_xy_coord.cpp`, read from the SDK source,
re-implemented here):

- each white, the photo's and the three illuminants', is placed at
  (tint / 200, min(1500 / T, 1)), with temperature and tint as the SDK's `dng_temperature`
  computes them (Robertson's isotemperature lines; tint = -3000 times the signed distance
  along the interpolated line);
- weights are 1 / (squared distance + 1e-8), normalised, put through a smoothstep
  (3x² - 2x³), cut below 0.02 (rescaled so 0.02 becomes 0 and 1 stays 1) and normalised again;
- `ColorMatrix`, `CameraCalibration` (identity where absent), `ForwardMatrix` and the hue/sat
  maps are the weighted sums. `AnalogBalance` and the calibration signature rule are as before;
- the as-shot white is the SDK's fixed-point loop on xy from D50 (blend for the white, map the
  neutral back, until x + y moves less than 1e-10 here, 1e-7 in the SDK; 100 passes, the SDK
  30; a loop that has not settled takes the mean of its last two whites, as the SDK does);
- each illuminant code's white is the SDK's: CIE values for A, B, C, D50-D75; daylight, flash
  and fine weather as D55, cloudy as D65, shade as D75; the fluorescent classes as F1, F8, F9,
  F2, F3, F4; ISO studio tungsten as 3200 K on the locus; 255 from `IlluminantData`.
- The third set is used only if it is valid the way the SDK requires: the first two
  illuminants a usable pair, `CalibrationIlluminant3` known, three distinct whites, and
  `ForwardMatrix` on all three or none. Otherwise the file develops as a two-illuminant
  profile and the report says why (`ColorMatrix3 ignored: ...`).
- With two illuminants, a 255 illuminant now blends by its `IlluminantData` white's
  Robertson temperature (the SDK's `IlluminantToTemperature`); before, it counted as unknown.

Two deliberate differences from the SDK: the isotemperature table keeps Lindbloom's
correction of the 325-mired row (u 0.24792; the SDK and Wyszecki and Stiles print 0.24702),
as `xy_to_cct` already did, which moves whites near 3077 K slightly; and the SDK's optional
low-temperature extension (off by default) is not followed.

What was not done: compiling the SDK's own functions next to these for a value-for-value
comparison. That was blocked in this session (running code downloaded from outside the
repository). The weights are therefore checked by their properties below, not against the
SDK's output; a run that can build the SDK should add that comparison.

## 1. Synthetic (`tests/test_dng_triple_illuminant.py`, 19 tests)

- A camera whose response under fluorescent F2 is its own matrix (no blend of its A and D65
  matrices). A DNG of patches lit by F2 with all three matrices: worst patch error **0.0005**
  linear, report `ColorMatrix3 at 4225 K (weights 0.00/0.00/1.00)`. The same file without the
  third matrix: **0.079** (`ColorMatrix1+2 at 4352 K`).
- `CalibrationIlluminant3` = 255 with an xy `IlluminantData3` gives the same result.
- A third matrix with no `CalibrationIlluminant3` is ignored with a note; the other rules
  (equal whites, partial `ForwardMatrix`, 255 with no data) each give their reason.
- Greys stay grey at a white between the three lights; the neutral-to-white loop returns the
  white within 1e-7 at six whites from 2,856 K to 6,504 K, including off the locus.
- Hue/sat maps blend with the same weights; at the F2 white the third map alone.
- `IlluminantData`: xy in both byte orders; an equal-energy spectrum gives (1/3, 1/3) exactly;
  a Planckian spectrum at 2856 K (c2 = 1.4388e-2) gives Illuminant A within 2e-4; malformed
  data is refused.

## 2. Against colour-science (`tools/triple_illuminant_check.py`, separate venv, colour-science 0.4.7)

```
temperature/tint, 5000 whites: worst relative temperature difference 6.07e-15, worst tint difference 4.94e-13
spectrum -> xy on 20 CIE illuminants at 1/5/10 nm: worst difference from colour-science sd_to_XYZ 4.76e-05
weights (A, D65, F2): one-hot at each light; partition everywhere; largest change over a 0.2-mired step 0.0075
```

- Temperature and tint on 5,000 random whites (1,700-25,000 K, up to 0.02 off the locus):
  temperature equals colour-science's Robertson to 6e-15 relative, tint equals 3000 x its Duv
  to 5e-13.
- Spectra: A, D50, D65, FL1-FL12 and LED-B1..B5 at 1, 5 and 10 nm steps, 380-780 nm,
  within 4.8e-5 of colour-science's `sd_to_XYZ`. The fluorescent whites computed this way
  land within 0.0003 of the F-lamp xy values the SDK assigns to the EXIF fluorescent codes
  (F2 0.37209, 0.37533 vs 0.37208, 0.37529), an independent check on that table.
- The CIE 1931 table (`cie1931.py`, generated from colour-science by `tools/gen_cie1931.py`)
  agrees with the copy in the SDK source to 5e-13.
- Weights over a walk from 2,000 to 10,000 K at tints -40..40: always a partition, no jump
  over 0.0075 per 0.2-mired step, so the blend is continuous as the white moves.

## 3. The suite

`PYTHONPATH=src python3 -m unittest discover -s tests`: 624 tests, 2 skipped, 1 error that
predates this change (`test_real_photo_calibration` imports PIL, broken in this container's
system Python). The engine tests pass under numpy too.

## Still wanted

A real triple-illuminant DNG or `.dcp` (none in RawTherapee's 161 profiles, which are DNG
1.4; Adobe's own DNG 1.6 profiles ship with Lightroom and Camera Raw, not openly), and the
SDK's own weight values on a grid of whites.
