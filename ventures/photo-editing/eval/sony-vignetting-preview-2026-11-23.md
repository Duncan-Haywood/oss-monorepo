# Sony's vignetting table against the camera's own embedded JPEG (2026-11-23)

Open item (flagship 7, `portfolio/flagships.yaml`): "Sony's vignetting table vs an evenly lit frame". On
2026-11-15 (`eval/sony-in-file-corrections-2026-11-15.md`) the ARW's vignetting table (raw IFD tag 0x7032),
decoded as `2 ** (2 ** (v / 2**13 - 1) - 0.5)`, lifted the corners 0.60-1.03 stops where lensfun's calibration
of the same lenses lifts 2.6. That left two explanations: the table is a partial correction by design, or the
formula is wrong. darktable, read for its behaviour only (GPL, no code copied), has used both readings: its
first embedded-metadata version squares the factor ("use the square of the correction factor",
`_init_coeffs_md_v1` in `src/iop/lens.cc`), its current version (`_init_coeffs_md_v2`) does not, and both put
knot `i` at radius `(i + 0.5) / (n - 1)` where ShootFlow puts it at `i / (n - 1)`.

No evenly lit Sony frame is reachable from this session (raw.pixls.us refused the connection). But every
ARW here says, in its maker note, that the camera's own vignetting correction was on (tag 0x2011 = 2, "Auto",
read the way ExifTool reads it), and every ARW embeds a JPEG the camera rendered. If that JPEG carries the
correction, comparing it with the raw at the same pixels measures the gain the camera applied, with no flat
frame needed. This check does that.

## Method

`tools/sony_vignetting_preview_check.py` (numpy, Pillow):

1. Raw to a half-size camera R, G, B image (one value per Bayer cell, black subtracted). The largest embedded
   JPEG decoded and its sRGB encoding undone: 1616 x 1080 on the A5000 and A7 III, a full-size 7008 x 4672 on the
   A7 IV.
2. Each JPEG pixel mapped into the raw by a scale and a centre, through the file's own distortion table
   (`sony_corrections`) when the maker note says distortion correction was on (tag 0x2013). Scale and centre are
   fitted by block matching (`warp_preview_check.match`).
3. In the central disk (radius under 0.2 of the corner distance) a monotone map from raw value to JPEG value is
   fitted per channel: the camera's exposure and tone curve together.
4. Per radius band, the camera's gain over the centre is the median of `map^-1(jpeg) / raw` over pixels inside the
   range the centre fit saw, with clipped sensels left out.
5. Set against the four readings: shipped; squared (darktable v1); darktable's knot positions; both.

`tests/test_sony_vignetting_preview.py` (6 tests) plants a gain and a tone curve on a textured scene and recovers
it within 0.04 stops per band, reads a flat field as flat (under 0.01), tells a 0.8-stop corner from its square,
and checks the four readings against the formula.

## Results

Files: `drewnoakes/metadata-extractor-images` `arw/` (the same three bodies as 2026-11-15; the NEX-5N, NEX-7
and A500 carry no table). Full output: `sony-vignetting-preview-2026-11-23.txt`.

The geometry first, because it says what the JPEG is. The fit lands where the maker note says it should:

| Body | Maker note distortion | Residual, table on | Residual, table off |
| --- | --- | --- | --- |
| A7 III, FE 24-105 F4 at 24 mm | Auto | 0.41 px (p90 0.69) | 3.06 px (p90 4.63) |
| A7 IV, FE 24-70 F2.8 GM II at 42 mm | Off | 3.97 px (p90 6.05) | 0.14 px (p90 0.38) |

(Medians of the patch offsets after the fit, in JPEG pixels.) So the embedded JPEG is the camera's processed
render, not a raw dump: on the A7 III it carries the distortion correction, and through ShootFlow's reading of
the table it lines up to 0.41 preview pixels (about 1.6 sensor pixels), where leaving the table out costs 3.06.
That is a second, independent check of the distortion reading, after 2026-11-15's agreement with lensfun within
9 px.

The gain, green channel, stops over the centre, at the outermost full band:

| Body (DRO) | Radius | Measured (IQR) | Shipped | Squared | dt knots | Squared + dt knots |
| --- | --- | --- | --- | --- | --- | --- |
| A7 III (Off) | 0.895 | +0.02 (0.07) | +0.64 | +1.27 | +0.54 | +1.08 |
| A7 IV (Off) | 0.817 | +0.04 (0.02) | +0.34 | +0.69 | +0.31 | +0.62 |
| A7 IV (Off) | 0.936, corners only | +0.24 (0.14) | +0.61 | +1.21 | +0.52 | +1.04 |
| A5000 (Auto, confounded) | 0.852 | -0.07 (0.17) | +0.29 | +0.58 | +0.23 | +0.46 |

On the two bodies with the dynamic-range optimiser off, the camera's JPEG brightens the frame by no more than
0.04 stops out to 0.82-0.90 of the corner distance, where even the gentlest reading predicts 0.31-0.64. Only the
A7 IV's last band, the four corners, rises (+0.24 green, +0.51 red). Red and blue do move a little (A7 III blue
+0.18, red -0.08 at 0.895), which looks like colour shading, not the luminance table. The A5000 had DRO on, which
lifts shadows locally, so its row is shown but not used.

## What this settles, and what it does not

- The embedded JPEG does not apply the 0x7032 table under any of the four readings, although the maker note says
  vignetting correction was "Auto" and the same JPEG does follow the distortion setting. Either these bodies'
  "Auto" leaves the luminance alone for these lenses at these apertures, or the JPEG engine uses the table in a
  way none of the four readings describes. A camera JPEG therefore cannot judge the formula; the item still needs
  an evenly lit frame (or a lens-cap-off flat of a white wall) from a Sony body with a table.
- It does argue against applying the table by default to make ShootFlow "look like the camera": the camera's own
  render, on these files, does not.
- The shipped decision stands: the table is read and reported, not applied (`sony_corrections.build_warp`'s note).
- Seeded faults, all caught: swapping which reading `table_gain` squares (2 tests fail), moving darktable's knots
  out by a whole step (1), and reversing the order of the fitted tone map (2).

Reproduce:

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
(cd mei && git sparse-checkout set arw)
PYTHONPATH=src python3 tools/sony_vignetting_preview_check.py mei/arw/"Sony ILCE-7M3 (A7M3).arw" \
  mei/arw/"Sony ILCE-7M4 (A7M4).ARW" mei/arw/"Sony ILCE-5000 (A5000).arw"
PYTHONPATH=src python3 tools/sony_vignetting_preview_check.py mei/arw/"Sony ILCE-7M3 (A7M3).arw" --distortion off
```

About 4 minutes per file on one core (the block matching is pure Python loops).
