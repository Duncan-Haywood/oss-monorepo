# Hasselblad Phocus .fff through the 3FR reader (2026-11-18)

Phocus, Hasselblad's tethering and export software, writes `.fff` files. Until today ShootFlow copied
them off a card and culled them from their preview, but stopped at the grade with "convert to DNG". This
run reads them with the 3FR reader (`src/shootflow/hasselblad.py`), checks them three ways, and fixes
three ways a `.fff` differs from a 3FR.

## Files

Every `.fff` on raw.pixls.us (CC0) under `data/Hasselblad/`, fetched 2026-11-18 with `curl -L`: eleven
files from nine bodies and backs. Three 3FRs from the same folders were fetched to compare:
`CFV-50c/20200215_BERLIN_OldNew_WestHafen_B0000420.3FR`, `X2D 100C/B0000079.3FR` and
`Hasselblad H4D/A0000902.3FR`.

| folder | file | Model tag | UniqueCameraModel | software tag | size |
|---|---|---|---|---|---|
| CFV-50 | 20170401_CCSG_on_Hasselblad_CFV-50-0002297.fff | Hasselblad CFV-50 | Hasselblad | 370:42:513:39:... | 8282 x 6240 |
| CFV-50c | 20200215_BERLIN_OldNew_WestHafen_B0000420.fff | Hasselblad CFV-50c | Hasselblad CFV | 3.6.9R/8730 | 8374 x 6304 |
| CFV-50c | B0002648.fff | Hasselblad CFV-50c | Hasselblad CFV | 3.6.9R/8730 | 8374 x 6304 |
| H4D-50 | 2-9-2017_street_0012.fff | Hasselblad H4D-50 | Hasselblad H4D | 370:42:513:39:... | 8282 x 6240 |
| H5D-40 | 20151114_CCSG_on_Hasselblad_H5D40-0726.fff | Hasselblad H5D-40 | Hasselblad H5D | 2.6.5R/8727 | 7410 x 5586 |
| H5D-50c | 20151114_CCSG_on_Hasselblad_H5D50c-0017.fff | Hasselblad H5D-50c | Hasselblad H5D | 3.6.9R/8730 | 8374 x 6304 |
| Hasselblad H4D-40 | Job_3583.fff | Hasselblad H4D-40 | Hasselblad H4D | 370:42:513:39:... | 7410 x 5586 |
| Hasselblad H6D-100cMS | h6d400c_1shot_0007.fff | Hasselblad H6D-100cMS | Hasselblad H6D | v1.20.1-22 | 12000 x 8816 |
| X1D II 50C | x1d-II-sample-02.fff | Hasselblad X1DM2-50c | Hasselblad X1D II 50C | 10.00.07.69 | 8384 x 6304 |
| X2D 100C | Job_0079.fff | Hasselblad X2D 100C | Hasselblad X2D 100C | 1.1.0 | 11904 x 8842 |
| X2D 100C | Job_0080.fff | Hasselblad X2D 100C | Hasselblad X2D 100C | 1.1.0 | 11904 x 8842 |

## The layout

A `.fff` is a big-endian TIFF (`MM`) with the 3FR's four IFDs: an 8-bit thumbnail as IFD0 (Make, Model,
UniqueCameraModel, AsShotNeutral, and the new tags below), the 16-bit CFA sensor as IFD1, then two RGB
previews. All eleven sensors are compression 7, Hasselblad's lossless JPEG, including the X1D II and X2D,
whose 3FRs are uncompressed. StripByteCounts is the stream's real length here (a 3FR writes the unpacked
size). The reader needed no change to decode them: `is_3fr` already accepted the files, the TIFF reader
honours `MM`, and the compressed stream is the same little-endian bit order.

## Check 1: every sensel against LibRaw 0.22.2

`tools/hasselblad_libraw_check.py` (rawpy 0.25 / LibRaw 0.22.2), rows in
`eval/hasselblad-fff-libraw-2026-11-18.jsonl`.

On all eleven files every sensel of the stored sensor equals LibRaw's `raw_image` (713.7 M in all), the
CFA is RGGB in both, and the stored AsShotNeutral equals LibRaw's `camera_whitebalance` to six places.
Black is the file's 256 (LibRaw 256) except the X2D's 4096 (LibRaw 4092-4093, its own estimate, as on
the X2D 3FR). The crop is the file's DefaultCrop; LibRaw's margins differ by 4-12 sensels on seven files,
as on 3FRs. Read time with the C decoder, including the gain test below: 0.7-1.2 s for 40-50 MP and
2.2-2.5 s for 100 MP. The three 3FRs fetched for comparison also still pass (0 sensels differ).

## Three differences from a 3FR

### 1. The colour matrix: ColorMatrix2, or none

No `.fff` has ColorMatrix1. Six write the body's matrix as ColorMatrix2 (50722) with no
CalibrationIlluminant; the developer uses a lone ColorMatrix2 as it would a lone ColorMatrix1 (illuminant
unknown). On those six it equals LibRaw's matrix for the body to four places.

Five carry no matrix at all: both CFV-50c files, the H4D-40, the H6D-100c and both X2D files. Before this
run they developed with an identity matrix (chromaticity 0.005-0.090 off LibRaw). Two of those bodies
have 3FRs on raw.pixls.us, and a 3FR always carries ColorMatrix1: the CFV-50c's B0000420 is the very frame
its `.fff` was exported from, and the X2D's B0000079 is the frame of Job_0079.fff. `OWN_MATRICES` in
`hasselblad.py` holds those two bodies' matrices as their own 3FRs write them, and the reader gives a
matrixless `.fff` from either body that ColorMatrix1, with a note. The X2D's own matrix is not LibRaw's
(LibRaw uses Adobe's numbers; the 3FR run found the same). The H4D-40 and H6D-100c have no public 3FR, so
their files still develop with the note "a .dcp camera profile is needed for colour"; Adobe's free DNG
Converter installs one per body, and `--dcp` takes it.

### 2. UniqueCameraModel names the series, not the body

Phocus writes "Hasselblad H4D" in UniqueCameraModel for both the H4D-40 and the H4D-50, whose sensors and
matrices differ (0.604 and 0.528 in the first cell; the H4D in the 3FR folder, a third sensor, writes
0.930). The CFV-50 writes plain "Hasselblad". The Model tag names the body. `camera_model` now returns the
Model tag (with "Hasselblad " in front, cut at a "/", so "CFV-50c/Flash Sync" is the CFV-50c) when it
extends UniqueCameraModel, and UniqueCameraModel otherwise ("X1DM2-50c" does not extend "Hasselblad X1D
II 50C", and the H4D 3FR's Model "Hasselblad H3D" does not extend "Hasselblad H4D"). That name picks the
`.dcp` and the `OWN_MATRICES` entry. On 3FRs it changes one name in the 3FR run's ten: the CFV-50c's
"Hasselblad CFV" becomes "Hasselblad CFV-50c", which is what Adobe's profile for it is called.

### 3. AnalogBalance: the newer exports apply it to the data and keep the old neutral

Every `.fff` has an AnalogBalance (50727) other than 1, 1, 1; no 3FR has the tag. The DNG specification
says the raw values have had that gain applied and that AsShotNeutral is a neutral in those values.

**Two pairs say what Phocus does.** `tools/hasselblad_fff_pair_check.py` reads each 3FR and its `.fff`
with the same reader (rows: `eval/hasselblad-fff-pair-2026-11-18.jsonl`):

| pair | AnalogBalance | median .fff / 3FR above black, R, G1, G2, B | green sensels off by >1 |
|---|---|---|---|
| CFV-50c B0000420 | 1.02435, 1.0, 1.00500 | 1.02425, 1.0, 1.0, 1.00495 | 0 |
| X2D 100C 0079 | 1.02808, 1.0, 1.01392 | 1.02797, 1.0, 1.0, 1.01385 | 0 |

Green is untouched and red and blue are the 3FR's values times AnalogBalance. AsShotNeutral is the same in
both files to every digit. So the `.fff`'s neutral is the neutral *before* the gain: read as the
specification reads it, every grey comes out tinted by the gain.

Developed at half size with the DNG colour model (the 3FR with its own matrix, the `.fff` with the same
matrix via `OWN_MATRICES`), mean linear colour over pixels unclipped in both:

| pair | neutral as written: chromaticity gap, mean .fff/3FR R, G, B | neutral x AnalogBalance: gap, ratio |
|---|---|---|
| CFV-50c B0000420 | 0.01662, 1.0856 / 0.9939 / 1.0048 | 0.00008, 0.9996 / 1.0001 / 0.9999 |
| X2D 100C 0079 | 0.00831, 1.0453 / 0.9886 / 1.0207 | 0.00004, 0.9998 / 1.0001 / 0.9999 |

Dropping the AnalogBalance tag instead (taking the matrix as the data's) does no better (0.01699 and
0.00851). Scaling the neutral by AnalogBalance makes each `.fff` develop to its own 3FR's colour.

**Not every export does it.** The first version scaled every `.fff`'s neutral. The develop check against
LibRaw then moved the H4D-50 from 0.0002 to 0.0276 and the H5D-40 from 0.0001 to 0.0319, which made the
step suspect on bodies without a pair. A digital gain leaves a mark the data can show: integers multiplied
by g > 1 skip 1 - 1/g of the codes, while an analogue gain or none skips none. Share of empty codes in each
colour's densest 1,024-code window (`hasselblad._gain_in_data`), against 1 - 1/AnalogBalance:

| file | R empty (expected) | G empty (expected) | B empty (expected) | gain in data |
|---|---|---|---|---|
| CFV-50c B0000420 | 0.023 (0.024) | 0.000 (0.000) | 0.005 (0.005) | yes |
| CFV-50c B0002648 | 0.023 (0.024) | 0.000 (0.000) | 0.005 (0.005) | yes |
| X1D II 50C | 0.000 (0.000) | 0.037 (0.037) | 0.051 (0.051) | yes |
| H6D-100c | 0.000 (0.000) | 0.006 (0.006) | 0.019 (0.019) | yes |
| X2D 100C 0079 | 0.026 (0.027) | 0.000 (0.000) | 0.014 (0.014) | yes |
| X2D 100C 0080 | 0.026 (0.027) | 0.000 (0.000) | 0.014 (0.014) | yes |
| H4D-50 | 0.000 (0.000) | 0.000 (0.057) | 0.000 (0.041) | no: no gaps |
| CFV-50 | 0.018 (0.047) | 0.033 (0.023) | 0.046 (0.000) | no: other gaps |
| H4D-40 | 0.161 (0.032) | 0.103 (0.011) | 0.040 (0.000) | no: other gaps |
| H5D-40 | 0.500 (0.089) | 0.238 (0.036) | 0.486 (0.000) | no: other gaps |
| H5D-50c | 0.111 (0.018) | 0.000 (0.000) | 0.003 (0.003) | no: R's gaps |
| the three 3FRs | 0.000 | 0.000-0.004 | 0.000 | (no tag) |

The six newer exports (Phocus 3.6.9 on the CFV-50c, and the X1D II, H6D and X2D) match in every channel
to 0.001; the H4D-50 has the tag and no gaps at all; the other four have gaps of other sizes, from some
other step. The reader scales the neutral only when every colour's empty share is within a quarter of the
expected one (plus 0.003), with at least 100 sensels a code in the window; otherwise it uses the neutral
as written, with a note saying which. Without numpy it cannot tell and uses the neutral as written.

## Check 2: developed colour against LibRaw

`tools/hasselblad_develop_check.py --colour=dng,dcraw` (half size, LibRaw in linear light), rows in
`eval/hasselblad-fff-develop-2026-11-18.jsonl`:

| file | matrix | neutral | gap, DNG model | gap, dcraw model |
|---|---|---|---|---|
| CFV-50 | ColorMatrix2 | as written | 0.0007 | 0.0000 |
| H4D-50 | ColorMatrix2 | as written | 0.0002 | 0.0000 |
| H5D-40 | ColorMatrix2 | as written | 0.0001 | 0.0000 |
| H5D-50c | ColorMatrix2 | as written | 0.0003 | 0.0000 |
| CFV-50c B0000420 | own (3FR) | scaled | 0.0099 | 0.0120 |
| CFV-50c B0002648 | own (3FR) | scaled | 0.0055 | 0.0124 |
| X2D 100C 0079 | own (3FR) | scaled | 0.0108 | 0.0111 |
| X2D 100C 0080 | own (3FR) | scaled | 0.0111 | 0.0113 |
| X1D II 50C | ColorMatrix2 | scaled | 0.0228 | 0.0228 |
| H6D-100c | none (identity) | scaled | 0.0054 | 0.0054 |
| H4D-40 | none (identity) | as written | 0.0860 | 0.0860 |

Where the neutral is used as written, the mean colour equals LibRaw's to four places with the dcraw model,
as on 3FRs. Where it is scaled, ours parts from LibRaw by about the gain, because LibRaw takes AsShotNeutral
as written; on the two paired frames the 3FR settles which is right (Check 3). The tool's 0.02 gate fails
on the X1D II, whose gains are the largest (1.039, 1.054), and on the matrixless H4D-40. This gate was
written for 3FRs, where LibRaw is a fair reference; for a scaled `.fff` it is not.

## Check 3: each .fff against its own 3FR

Above (the pair tables): sensels, gains and developed colour, gated at 0 green sensels off and 0.001 in
chromaticity; both pairs pass with 0.00008 and 0.00004.

## Tests

`tests/test_hasselblad.py` gained `PhocusFffTests`: the camera name rule on seven Model and
UniqueCameraModel pairs taken from the real files; a lone ColorMatrix2 developing; `OWN_MATRICES` taking
over when a file has no matrix, and the note when the body is not listed; the neutral scaled when a
synthetic 800 x 800 frame carries the gain, kept when it carries the tag without the gain, and kept when the
frame is too small to tell; and a synthetic "3FR and its export" pair developing to the same colour
(unscaled, red is off by about 1,000 of 65,535). Both gain tests fail if the scaling is switched off.
`raw_preview.is_3fr_path` (and so `is_developable_path`) now takes `.fff`, so the grade stage develops
them; an Imacon/FlexColor scanner `.fff`, an RGB TIFF with no CFA image, is refused by the reader with
the reason.

## What is left

- The H4D-40 and H6D-100c need a matrix: a 3FR or camera DNG of either body.
- The older exports' other gaps (H5D-40: half of R and B empty) are some digital step not identified here;
  a 3FR and `.fff` pair of one of those bodies would say what, and whether their neutral needs anything.
- No Phocus or Adobe render of a `.fff` was compared, so which neutral Phocus itself uses is inferred from
  the 3FR pairs, not observed.
