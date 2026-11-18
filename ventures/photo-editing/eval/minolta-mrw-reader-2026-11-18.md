# Minolta and Konica Minolta MRW read directly, against LibRaw (2026-11-18)

## Why

The card copy kept `.MRW` files since 2026-11-16, but the developer refused them: a photographer with
a DiMAGE A2 or a Dynax 7D archive had to run every file through Adobe's DNG Converter first. These
are the last bodies Minolta made (2001-2005) and still sell used for little; their files sit in many
archives. The format needed only public sample files: raw.pixls.us (CC0) has one file for each of
ten Minolta bodies, and the proxy serves it (`curl -L`).

## What was built

`src/shootflow/mrw.py`, standard library only (numpy speeds the 12-bit unpack when present):

- **The block chain.** `\0MRM` then a 4-byte big-endian length; the sensor starts that far past
  byte 8. Before it, named blocks with 4-byte lengths: PRD, WBG, RIF, TTW and on some bodies PAD.
- **PRD**: an 8-byte version string, sensor rows and columns, image rows and columns (8 fewer each
  way), data size (12 or 16), pixel size (12), storage (`0x59` packed, `0x52` unpacked), two
  unknown bytes, Bayer pattern (`1` RGGB, `4` GBRG). Read on every file as listed in the table.
- **Sensor**: 12-bit MSB-first packed (`0x59`) or big-endian 16-bit words holding 12-bit values
  (`0x52`, the DiMAGE 7, 7i and 7Hi). The bytes left in the file after the header equal
  `rows x columns x 1.5` or `x 2` exactly on all nine files.
- **WBG**: 4 bytes of scale codes, then four 16-bit gains in the Bayer pattern's 2x2 order. dcraw
  writes this as an index trick with a special case for the DiMAGE A200; reading the gains in the
  order of the PRD's pattern says the same thing without naming a model (the A200's pattern is GBRG,
  its gains G, B, R, G).
- **TTW**: a complete TIFF (offsets from the block's first byte) with Make, Model, Orientation and
  the EXIF IFD; its IFD0 becomes the image's head, so orientation and lens tags reach the develop.
- **Levels**: black 0 (LibRaw also uses 0 on every body, and the minimum stored values are 0-34);
  white is the clip pile when the frame has one (`cr2._white_from_clipping`), else 4095.
- Wired into `raw_develop.parse_raw`, the colour gate (a `.dcp` is required, as for every non-DNG
  raw), `camera_profiles.camera_of` ("Minolta DiMAGE A1", "Konica Minolta DYNAX 7D"), the CLI's
  `--dcp FOLDER`, and the grade stage (`raw_preview.needs_profile_path` / `is_developable_path`).

## Check 1: every sensel against LibRaw

Run: `PYTHONPATH=src python tools/mrw_libraw_check.py *.MRW` with rawpy 0.28.0 (LibRaw 0.22.2) and
numpy in a venv. Rows: `eval/minolta-mrw-libraw-2026-11-18.jsonl`.

| body (raw.pixls.us folder) | storage | sensels | differing | CFA | WB R/G, B/G (= LibRaw) | black (= LibRaw) | our white | LibRaw white | read s |
|---|---|---|---|---|---|---|---|---|---|
| DiMAGE 7 | 16-bit | 4,951,104 | 0 | RGGB | 1.6475, 1.3908 | 0 | 3965 | 3965 | 0.02 |
| DiMAGE 7i | 16-bit | 4,951,104 | 0 | RGGB | 1.4375, 1.4375 | 0 | 4095 | 3965 | 0.02 |
| DiMAGE 7Hi | 16-bit | 4,951,104 | 0 | RGGB | 1.6055, 1.3398 | 0 | 4095 | 3965 | 0.02 |
| DiMAGE A1 | 12-bit packed | 4,951,104 | 0 | RGGB | 1.3320, 2.1055 | 0 | 3973 | 3979 | 0.08 |
| DiMAGE A2 | 12-bit packed | 8,036,032 | 0 | RGGB | 2.0039, 1.4375 | 0 | 3965 | 3983 | 0.11 |
| DiMAGE A200 | 12-bit packed | 8,049,120 | 0 | GBRG | 1.8824, 1.6314 | 0 | 4034 | 4095 | 0.12 |
| ALPHA-7 DIGITAL | 12-bit packed | 6,056,128 | 0 | RGGB | 1.5938, 1.7578 | 0 | 4091 | 4091 | 0.16 |
| DYNAX 7D | 12-bit packed | 6,056,128 | 0 | RGGB | 1.6992, 1.6992 | 0 | 4091 | 4091 | 0.09 |
| MAXXUM 7D | 12-bit packed | 6,056,128 | 0 | RGGB | 1.6641, 1.7852 | 0 | 4095 | 4091 | 0.10 |

54,057,952 sensels, none different; the CFA, white balance and black level equal on all nine.
The DiMAGE Z2's `.MRW` (`data/Minolta/Dimage Z2/`) starts with `09 b2 21 0f`, not `\0MRM`; dcraw and
LibRaw name it by its file size alone. It is refused ("not a Minolta MRW (no \0MRM header)") and
falls back, like any refused raw, to being culled from its preview.

**White level, not gated.** LibRaw takes it from a per-model table that no tag in the file states.
On six frames a clip pile was found: on the DiMAGE 7, Alpha-7 Digital and Dynax 7D it equals LibRaw's
value, on the A1 it is 6 levels lower, on the A2 18 and on the A200 61. A lower white renders the top
0.5-1.5% of the range as clipped a little early; it never leaves a clipped highlight tinted, which a
too-high white does. On the three frames with no pile (DiMAGE 7i, 7Hi, Maxxum 7D) 4095 is used,
130 above LibRaw's 3965 on the 7i and 7Hi: a highlight that clipped on those bodies would develop
slightly grey rather than white. Taking LibRaw's values would need a per-model table; not done.

## Check 2: the whole develop

No Adobe `.dcp` for these bodies is in the tree, so `tools/mrw_develop_check.py` develops each file
with a stand-in profile whose ColorMatrix1 (D65) is LibRaw's own `rgb_xyz_matrix` for the body, then
compares the mean linear-light colour of the picture with `rawpy.postprocess(use_camera_wb=True,
no_auto_bright=True)`, over pixels unclipped in both (99.2-100% of each frame). Rows:
`eval/minolta-mrw-develop-2026-11-18.jsonl`.

| body | develop s | chromaticity gap of the means |
|---|---|---|
| DiMAGE 7 | 0.42 | 0.0162 |
| DiMAGE 7i | 0.39 | 0.0050 |
| DiMAGE 7Hi | 0.42 | 0.0031 |
| DiMAGE A1 | 0.44 | 0.0068 |
| DiMAGE A2 | 0.59 | 0.0074 |
| DiMAGE A200 | 0.71 | 0.0032 |
| ALPHA-7 DIGITAL | 0.63 | 0.0077 |
| DYNAX 7D | 0.45 | 0.0167 |
| MAXXUM 7D | 0.48 | 0.0036 |

All nine within the 0.02 gate. A first version compared means of the sRGB-encoded values and put the
A200 (a frame of saturated reds) at 0.036: averaging after the gamma curve shifts a saturated frame's
mean colour, so the comparison moved to linear light, where it is 0.003. Ours is 17-26% brighter in
linear light on every file, about evenly across the three channels; the two developers scale the
camera-to-sRGB step differently (the DNG colour model against LibRaw's own normalisation). The cause
was not traced here, and a uniform scale does not change the chromaticity gate. This is a check that the reader feeds the developer the
right numbers, not a claim about how close the colour is to Adobe's: with a real Adobe profile the
colour will follow that profile.

## Tests

`tests/test_mrw.py` (13 tests): a writer builds MRWs as the cameras lay them out (header, PRD, WBG,
RIF, TTW with a little-endian TIFF, PAD, then the sensor) and the reader returns every sensel exactly,
packed and unpacked; the pure-Python unpack agrees with numpy's; the A200's GBRG gains land on the
right channels; the clip pile sets the white; orientation comes from TTW; a missing WBG is noted;
unknown patterns and layouts, truncated data and the Z2's headerless file are refused; the CLI picks
"Konica Minolta DYNAX 7D Adobe Standard.dcp" from a folder and writes a master.

## Open

- An Adobe `.dcp` for one of these bodies through the profile chooser (Adobe's names for the 7D's
  three model strings are not checked; the chooser also matches the profile's UniqueCameraModel).
- The Dynax 5D / Maxxum 5D (no sample on raw.pixls.us) and an MRW written little-endian (`\0MRI`,
  read by the code but never seen).
- The DiMAGE Z2's headerless raw, if a second sample turns up to say its layout is not a one-off.
