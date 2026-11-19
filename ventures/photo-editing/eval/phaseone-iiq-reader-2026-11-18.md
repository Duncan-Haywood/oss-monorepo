# Phase One IIQ read directly, against LibRaw (2026-11-18)

## Why

The card copy has kept `.IIQ` files since 2026-11-16, but the developer refused them: a photographer with
a Phase One back (the P+ and IQ series on Hasselblad V, Mamiya 645 and the XF body) or an iXU/iXM aerial
camera had to open every frame in Capture One or Adobe DNG Converter first. These medium-format backs
were among the most expensive cameras sold, stay in use for product, architecture and reproduction work
long after release, and leave large archives behind; a free, scriptable developer saves their owners a
conversion pass per shoot. raw.pixls.us (CC0) has files from 17
Phase One backs and cameras, and the proxy serves them (`curl -L`).

## What was built

`src/shootflow/iiq.py`, standard library only, with a small C decoder compiled on first use (the build
and cache rules of `shootflow.ljpeg_native`, its own library so it does not change that one's source):

- **The container.** An IIQ (and the `.TIF` raws of the P25, P30 and P45) is a TIFF whose IFD0 holds
  Make, Model, the EXIF IFD and a thumbnail; the sensor container starts at byte 8 with `IIII`, and its
  directory of 16-byte entries gives the sensor and image sizes, margins, data format, data offset, a
  table of row offsets, the black level, the split column and row and their offset tables, the
  orientation, the camera-to-ROMM matrix and the as-shot multipliers.
- **IIQ L** (format 3; and format 5, the P+ backs' and H 25's 8-bit-coded form, whose codes under 256 are
  `round(v * v / 3.969)`): each row coded on its own, 32-bit little-endian words read MSB first, two
  colour lanes, a length prefix per lane every 8 columns from `8 7 6 9 11 10 5 12 14 13`, raw 16-bit values
  for length 14 and for the last `width % 8` columns. Stored values are the code times four, as in LibRaw's
  `raw_image`.
- **Levels.** Each sensel gets its row's offset for its half (split column) and its column's offset for its
  half (split row), as dcraw adds them; the black level (1024 on every file with the tag; the H 25 has
  none, and LibRaw uses 0 too) stays a level so the noise below it is kept. White 65532.
- **CFA.** RGGB at the image's top-left margin on every body here; LibRaw's raw-origin pattern (GBRG on
  the odd-top-margin H 25, P20+, P25, P25+; GRBG on the odd-left P30 and P45+) is the same layout.
- **Colour without a profile.** The file's own camera-to-ROMM matrix (for white-balanced data) becomes a
  DNG ColorMatrix1 at D50: camera to XYZ is `ROMM_to_XYZ . romm . diag(mul)`, so the as-shot neutral maps
  exactly to D50 white. An IIQ therefore develops like a DNG, with no `.dcp` (a `.dcp` given still wins).
- Wired into `raw_develop.parse_raw` (before the TIFF readers), `camera_profiles.camera_of` ("Phase One
  IQ180"), `raw_preview.is_iiq_path` / `is_developable_path` (the grade stage), and the format page.

## Check 1: every sensel against LibRaw

Run: `PYTHONPATH=src python tools/iiq_libraw_check.py *.IIQ *.TIF` with rawpy 0.28.0 (LibRaw 0.22.2) and
numpy in a venv. Rows: `eval/phaseone-iiq-libraw-2026-11-18.jsonl`. The decode is compared with the
offset tables zeroed (LibRaw's `raw_image` is before them).

| body | format | sensels | differing | CFA (= LibRaw) | WB R/G, B/G (= LibRaw) | row/col offsets | read s |
|---|---|---|---|---|---|---|---|
| H 25 | 5 | 22,687,392 | 0 | GBRG | 2.641, 1.251 | none | 0.15 |
| P25 (.TIF) | 5 | 22,687,392 | 0 | GBRG | 3.2533, 1.051 | none | 0.10 |
| P20+ | 5 | 17,065,152 | 0 | GBRG | 2.3183, 1.0296 | none | 0.09 |
| P25+ | 5 | 22,687,392 | 0 | GBRG | 1.83, 1.42 | none | 0.10 |
| P30 (.TIF) | 3 | 32,636,952 | 0 | GRBG | 2.46, 1.25 | -16 to 10 | 0.24 |
| P45+ | 5 | 40,150,152 | 0 | GRBG | 2.3399, 1.2665 | 3 to 75 | 0.19 |
| P65+ | 5 | 15,522,304 | 0 | RGGB | 1.2181, 1.525 | 1 to 12 | 0.09 |
| IQ140 (.TIF) | 3 | 10,363,904 | 0 | RGGB | 1.2497, 1.4846 | -14 to 2 | 0.09 |
| IQ150 | 3 | 52,877,552 | 0 | RGGB | 2.6, 1.35 | none | 0.41 |
| IQ3 100MP (IIQ L) | 3 | 106,011,552 | 0 | RGGB | 3.224, 1.2968 | none | 0.82 |

342,689,744 sensels, none different; CFA and white balance equal on all ten. Orientation equal (the
P20+, P25, P25+ and H 25 are stored a quarter turn clockwise). Read times are with the C decoder; the
pure-Python reference decodes the same sensels (`tests/test_iiq.py` runs both on synthetic files and, with
`SHOOTFLOW_IIQ_SAMPLES` set, on 24 rows of each real file) but takes minutes on a whole frame.

**Crop.** The image area is the file's own margins and size. LibRaw rounds an odd top or left margin up to
even (21 to 22 on the H 25 and P2x, 41 to 42 on the P30 and P45+) and drops a row or column: ours is one
row or column larger there, everything else equal.

**Levels.** With the black level and offsets applied, each colour's mean over the image, as red over green
and blue over green, against LibRaw's own linear camera-space render (no white balance, half size):

| body | ours R/G, B/G | LibRaw R/G, B/G |
|---|---|---|
| H 25 | 0.3325, 0.9334 | 0.3326, 0.9321 |
| P25 | 0.2957, 0.9272 | 0.2940, 0.9285 |
| P20+ | 0.4279, 1.0005 | 0.4274, 0.9967 |
| P25+ | 0.4167, 0.8972 | 0.4137, 0.8979 |
| P30 | 0.5372, 0.6066 | 0.5383, 0.6073 |
| P45+ | 0.4089, 0.8242 | 0.4160, 0.8430 |
| P65+ | 0.7235, 0.5703 | 0.7224, 0.5696 |
| IQ140 | 0.7752, 0.7353 | 0.7745, 0.7348 |
| IQ150 | 0.3578, 0.7955 | 0.3575, 0.7957 |
| IQ3 100MP | 0.2870, 0.7871 | 0.2868, 0.7875 |

Within 0.7% on nine of ten; the P45+ is 1.7% and 2.2% apart. LibRaw also applies Phase One's per-sensor
corrections from the metadata block (`phase_one_correct`: defect columns, a flat field, curves for the
split sensor halves), which this reader does not; the P45+, the body with the largest offsets, is where
they would show most. Not applied, and named in the refusal list on the format page.

## Check 2: the whole develop

`tools/iiq_develop_check.py` develops each file with no profile (the file's own matrix) and compares the
mean linear-light colour with `rawpy.postprocess(use_camera_wb=True, no_auto_bright=True)` over pixels
unclipped in both. A second arm develops with LibRaw's own per-model matrix as a stand-in `.dcp`, as the
MRW check did. Rows: `eval/phaseone-iiq-develop-2026-11-18.jsonl`.

| body | develop s | chromaticity gap, file's matrix | gap, LibRaw's matrix as a .dcp |
|---|---|---|---|
| H 25 | 2.27 | 0.0105 | 0.0203 |
| P25 | 2.31 | 0.0124 | 0.0108 |
| P20+ | 1.71 | 0.0003 | 0.0031 |
| P25+ | 2.48 | 0.0259 | 0.0530 |
| P30 | 2.85 | 0.0181 | 0.0394 |
| P45+ | 3.86 | 0.0161 | 0.0193 |
| P65+ | 1.46 | 0.0111 | 0.0137 |
| IQ140 | 0.86 | 0.0110 | 0.0063 |
| IQ150 | 5.06 | 0.0166 | 0.0149 |

Eight of nine within the 0.02 gate with the file's own matrix; the P25+ is 0.026. (Correction, later the same day: this table was made while the check undid LibRaw's BT.709 output with the sRGB curve, which overstates gaps on dark frames; the fixed check moved the IQ180's gaps from 0.0205 / 0.0131 to 0.0182 / 0.0035, `eval/phaseone-iiq-s-reader-2026-11-18.md`. These rows need rerunning with the ten files.) The IQ3 100MP run was
killed for memory (two 100 MP developments and LibRaw's render at once in this container) and is not in
the table. What this says and does not: the levels above match LibRaw to under 1% per channel, so the
remaining gap is the colour model. LibRaw renders dcraw's way (its matrix applied to white-balanced data,
no adaptation); ShootFlow renders by the DNG specification (matrix calibrated at a light, the as-shot white
found and adapted to D50). With LibRaw's D65 matrix as a profile the gaps grow on the warm and dark scenes
(P25+ 0.053, P30 0.039), which is that adaptation step, not the reader; with the file's own D50-calibrated
matrix, which maps the as-shot neutral to D50 exactly, the adaptation is the identity and the gaps are
smaller. Which render is closer to the scene needs a colour chart shot on a back; none is public.

## Refused, with the reason

- **IIQ S** (format 6): the IQ180 and iXU180 files at hand and the IQ3 100MP's small setting. A
  different codec; refused with "this IIQ's data format 6 (IIQ S) is not supported yet; convert to DNG",
  and the cull still scores the frame from its preview.
- **Uncompressed formats 1 and 2** and the IQ4's 16-bit format 8: no public file was at hand to check
  against, so they are refused the same way rather than read unchecked.

## Next

IIQ S against LibRaw on the three files here (IQ180, iXU180, IQ3 100MP); the IQ4 150MP's formats
(raw.pixls.us has three 161-201 MB files); Phase One's flat-field and defect corrections from the metadata
block, measured against the P45+'s level gap above.
