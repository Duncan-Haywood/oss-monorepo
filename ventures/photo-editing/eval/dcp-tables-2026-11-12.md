# Profile hue/saturation maps, look tables and .dcp profiles, checked (2026-11-12)

What changed: in the default `dng` colour model, `shootflow develop` now applies a camera
profile's `ProfileHueSatMap` and `ProfileLookTable` (DNG 1.2 onwards). They can come from the
DNG itself or from a `.dcp` camera profile passed with `--dcp`. Code: `dng_colour.HueSatTable`
and `ProfileLook`, `raw_develop.read_dcp` and `_profile_look`, and `raw_develop_np.apply_look`.

The order follows the DNG specification: camera to linear ProPhoto (ROMM), pin to [0, 1], the
hue/saturation map (two maps blended for the as-shot white with the same mired weight as the
matrices), then the exposure (`BaselineExposure` + `BaselineExposureOffset` + `--exposure`),
pin, then the look table, then ProPhoto to linear sRGB and the sRGB curve. `ProfileToneCurve`
is **not** applied yet; the report says so when a profile carries one.

## 1. Synthetic (`tests/test_dng_profile_tables.py`, 15 tests)

- The table code is compared with a second implementation written in the test from the
  stdlib's `colorsys` HSV and explicit corner weights. They share no code. Random tables of
  shape 90x30x1, 6x6x3, 36x8x16 (sRGB-encoded value axis) and 1x2x1, 3,000 random colours
  each: worst difference under 1e-9.
- Known edits: a +60 degree shift turns (0.5, 0.1, 0.1) into (0.5, 0.5, 0.1); saturation and
  value scales; interpolation across the 360/0 hue wrap (halfway gives 15 degrees between 30
  and 0); the sRGB-encoded value axis; greys unchanged whatever the shift.
- Renders: a DNG carrying a +20 degree map comes out as the no-table render rotated by hand
  (colorsys, in ProPhoto) to within 0.004 linear. The same holds for a desaturating 4x3x4 look
  table with sRGB encoding. Identity tables and `profile_tables=False` give byte-identical
  output to the plain render. A `.dcp` with the same tags gives the same bytes as the tags
  embedded in the DNG. A DCP made for another camera renders with a note. A malformed table is
  skipped with a note. Two maps blend at the white's weight.
- Engines: numpy and pure Python give the same bytes with maps, look tables, half size and
  positive and negative exposure. numpy's vectorised `power` may differ from C `pow` in the last
  bit, so the sRGB value axis calls Python's `**` per sample.

## 2. 161 real camera profiles (`tools/dcp_check.py`)

These are RawTherapee's `rtdata/dcpprofiles` (GPL repository, fetched at run time with a
sparse git clone and not committed). Run: `PYTHONPATH=src python3.13 tools/dcp_check.py
rt/rtdata/dcpprofiles --samples 2000`, 7.0 s.

| | |
|---|---|
| profiles read | 161 of 161, no notes |
| shapes (map, second map, look table) | 90x30x1 + map 2 + 90x30x30 sRGB: 70; 90x30x1 + map 2: 53; 6x6x3: 34; 90x30x1 + 90x30x30 sRGB: 2; 90x30x1: 1; 90x25x1 + map 2: 1 |
| carry a ProfileToneCurve | 126 (not applied) |
| grey spread through the tables | 0 (exactly grey) |
| largest jump across the hue wrap | 4e-7 |
| numpy vs pure Python, 2,000 colours x 161 profiles | 0 mismatches |
| mean hue shift on saturated colours (ProPhoto s 0.3-0.9, v 0.2-0.8), per profile | median 10.0 degrees, range 0-24 |
| mean saturation ratio, per profile | median 1.27, range 1.00-1.43 |
| 2-D maps (127) / 3-D 6x6x3 maps (34) | median hue shift 11.2 / 1.0 degrees; saturation x1.29 / x1.015 |

Two profiles stand out:

- **FUJIFILM X-A7**: its first map has hue shifts of -179.2 and +175.9 degrees in neighbouring
  cells (hue cell 79). Linear interpolation, which the specification and dng_sdk both use,
  runs through 0 between those cells, so one colour in the sample moved 171 degrees. This
  looks like an angle-wrap fault in how the profile was made. The reader follows the
  specification and does not try to correct it.
- **Sony SLT-A55V**: its 90x25 maps are the identity. The reader detects this and renders with
  the matrices alone, byte-identical to a render without the tables.

## 3. A real raw file with its camera's profile

The file is rawpy's `RAW_CANON_5DMARK2_PREPROD.CR2`, written into a DNG by
`tools/libraw_differential.py --keep` (Adobe's D65 matrix from LibRaw, as-shot neutral). It
was developed at half size, 2817x1876, with RawTherapee's `Canon EOS 5D Mark II.dcp`
(ForwardMatrix pair, two 90x30 maps, a tone curve).

| render | matrix | time (numpy) |
|---|---|---|
| the DNG's own tags | ColorMatrix1 (D65), white 6228 K | 1.2 s |
| `--dcp`, `--no-profile-tables` | ForwardMatrix 1+2 at 5949 K | 1.3 s |
| `--dcp` (maps applied) | same, plus HueSatMap 90x30x1 | 3.8 s |

Differences in 8-bit steps: DCP matrices against the DNG's tags, mean 3.6, p99 23.9, max 135,
and 43% of pixels move more than 5 steps. Adding the maps on top of the DCP matrices gives mean
3.6, p99 25.7, max 125.5, 36% over 5 steps. The pure-Python engine gives the same bytes as numpy
for the whole frame with the maps applied (34.7 s against 3.8 s).

These numbers say how much the profile changes a real frame. They do not say which render is
closer to the scene. That still needs a real colour chart shot with the camera.

## Not done

- `ProfileToneCurve`. dng_sdk applies it with a hue-preserving RGB tone operator through a
  cubic spline. 126 of the 161 profiles carry one, and without it an Adobe-style profile looks
  flatter than in Lightroom.
- `ColorMatrix3` and the DNG 1.6 triple-illuminant tables; `ProfileGainTableMap`.
- A side-by-side against Adobe's or RawTherapee's own render of the same DCP. No such renderer
  could be installed here.
