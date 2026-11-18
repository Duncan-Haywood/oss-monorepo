# Hasselblad 3FR read directly, against LibRaw (2026-11-18)

## Why

The card copy kept `.3FR` files since 2026-11-16, but the developer refused them: an H- or X-series
photographer had to export every frame through Phocus or Adobe's DNG Converter first. Medium-format
shooters are the users most likely to pay for a careful raw pipeline, and their files are the biggest
(100 MP on the X2D). raw.pixls.us (CC0) has one 3FR for each of ten Hasselblad bodies and backs, and the
proxy serves them (`curl -L`).

## What was built

`src/shootflow/hasselblad.py`, standard library only (C through `ljpeg_native` when a compiler is present,
numpy for one level check when installed):

- **Structure.** A little-endian TIFF. IFD0 is an 8-bit RGB thumbnail with Make "Hasselblad" and three DNG
  tags no other maker's raw carries: ColorMatrix1, AsShotNeutral and UniqueCameraModel (no DNGVersion, no
  CalibrationIlluminant). The second IFD is the sensor: CFA, 16 bits, one sample, with BlackLevel,
  WhiteLevel, DefaultCropOrigin/Size and, on the 100 MP bodies, MaskedAreas. No CFAPattern tag; RGGB at the
  sensor's first sensel on all ten, as LibRaw reads them.
- **Compression 1** (X1D, X1D II, X2D, CFV II 50C, CFV 100C): little-endian 16-bit words.
- **Compression 7** (H3D, H4D-60, CF132, CFV, CFV-50c): an SOF3 header with one Huffman table (the CFV
  writes a 0xFF fill byte after SOF3), then not a JPEG scan: bits MSB first from little-endian 32-bit
  words, no stuffing; two size codes per pair of sensels, then both differences; prediction from the
  same-colour sensel two columns left, 0x8000 at each row's start, and, when the SOS predictor is 11, half
  the difference two rows up. StripByteCounts holds the unpacked size, not the stream's. Decoded in C
  (`shootflow_hasselblad_run`), with the Python reference (`_decode_python`) kept; on the first 64 rows of
  all five compressed files the two agree exactly. All five real files use predictor 8; predictor 11 is
  covered by synthetic files only.
- **Signed data, found from the sensels.** The H4D-60's 3FR is black-subtracted and its noise goes below
  zero, so a sensel at -3 is stored as 65533: read as written, 318,938 dark sensels (0.5%) would develop as
  white specks. Such a frame says black 0, white 32767, and has 0.5% of its sensels in the top 256 codes
  with none in the 16,128 codes below. That gap is the test (`_wraps_below_zero`): when it holds, every
  value is shifted up 256 modulo 2^16 and black is 256. LibRaw does the same by model (H4D-60 3FR:
  `load_flags = 256`, black 256); the test needs no table and leaves the other nine files untouched.
- **Colour.** The in-file ColorMatrix1 equals LibRaw's `rgb_xyz_matrix` (Adobe's numbers) on eight of ten
  bodies, so a 3FR develops like a DNG, with no `.dcp`; a profile from `--dcp` still replaces it. The two
  100 MP bodies (X2D, CFV 100C) carry Hasselblad's own matrix, a little off LibRaw's table.
- Wired into `raw_develop.parse_raw`, `camera_profiles.camera_of` (a profile is optional),
  `raw_preview.is_developable_path` (so the grade stage develops 3FRs; `needs_profile_path` stays false),
  and `still_for_review` (a 3FR with no JPEG preview is proxied from a half-size develop).

## Check 1: every sensel against LibRaw

Run: `PYTHONPATH=src python tools/hasselblad_libraw_check.py *.3FR` with rawpy 0.28.0 (LibRaw 0.22.2) and
numpy in a venv. Rows: `eval/hasselblad-3fr-libraw-2026-11-18.jsonl`.

| raw.pixls.us folder | UniqueCameraModel | storage | sensels | differing | WB = LibRaw | black (ours / LibRaw) | read s |
|---|---|---|---|---|---|---|---|
| CF132 | ixpressCF132 | lossless JPEG | 22,347,776 | 0 | yes | 0 / 0 | 0.31 |
| CFV | Hasselblad96 | lossless JPEG | 16,777,216 | 0 | yes | 0 / 0 | 0.21 |
| H3D | H3D | lossless JPEG | 39,621,472 | 0 | yes | 0 / 0 | 0.48 |
| Hasselblad H4D | H4D (60 MP) | lossless JPEG, signed | 60,884,208 | 0 | yes | 256 / 256 | 1.37 |
| CFV-50c | CFV | lossless JPEG | 52,789,696 | 0 | yes | 256 / 256 | 0.88 |
| X1D | X1D | 16-bit | 52,852,736 | 0 | yes | 256 / 256 | 0.10 |
| X1D II 50C | X1D II 50C | 16-bit | 52,852,736 | 0 | yes | 256 / 256 | 0.11 |
| cfv 50C II | X1D II 50C | 16-bit | 52,852,736 | 0 | yes | 256 / 256 | 0.18 |
| X2D 100C | X2D 100C | 16-bit | 105,255,168 | 0 | yes | 4096 / 4093-4094 | 0.54 |
| CFV 100C | CFV 100C/Electronic Shutter | 16-bit | 105,255,168 | 0 | yes | 4096 / 4093-4094 | 0.83 |

561,488,912 sensels, none different; the CFA and the as-shot white balance equal on all ten. Before the
signed-data test the H4D-60 differed in every sensel (by +256, and by -65280 where the value had wrapped).

Reported, not gated:

- **Black on the 100 MP bodies**: the file says 4096; LibRaw 4093 and 4094 (it reads them from elsewhere;
  3 levels in 61,439).
- **White on the H4D-60**: ours 33,023 (the tag's 32,767 plus the shift), LibRaw 33,025 (`0x8101`, a table
  value).
- **Crop**: ours is the file's DefaultCrop; LibRaw's margins come from its table and are 2-16 sensels wider
  (equal on the CFV-50c). The CF132 and CFV hold an 8-sensel border LibRaw keeps and the file's crop drops.

## Check 2: the whole develop

`tools/hasselblad_develop_check.py --colour=dng,dcraw *.3FR` develops each file at half size with its own
matrix and compares with `rawpy.postprocess(use_camera_wb=True, no_auto_bright=True, half_size=True,
gamma=(1, 1))`, cut to the sensor area both renders cover, over the pixels unclipped in both. Rows:
`eval/hasselblad-3fr-develop-2026-11-18.jsonl`. Gate: the chromaticity of the two mean colours within 0.02.

| body | develop s (half) | gap, DNG colour model | gap, dcraw method |
|---|---|---|---|
| CF132 | 0.48 | 0.0024 | 0.0000 |
| CFV | 0.29 | 0.0015 | 0.0000 |
| H3D | 0.77 | 0.0006 | 0.0000 |
| H4D-60 | 1.18 | 0.0018 | 0.0000 |
| CFV-50c | 0.90 | 0.0022 | 0.0000 |
| X1D (tungsten, 2,685 K) | 0.68 | 0.0172 | 0.0000 |
| X1D II 50C | 0.75 | 0.0010 | 0.0000 |
| cfv 50C II | 0.85 | 0.0071 | 0.0000 |
| X2D 100C | 1.65 | 0.0019 | 0.0021 |
| CFV 100C | 1.78 | 0.0032 | 0.0032 |

With the dcraw method (as-shot multipliers, matrix taken as D65, no adaptation: what LibRaw does) the mean
colour equals LibRaw's to four places on eight bodies; the two 100 MP bodies differ by their in-file matrix.
The DNG model, the default, adapts from the shot's white to D50 by Bradford, so it parts most from LibRaw
on the tungsten-lit X1D frame (0.0172), as expected. Full-size develops of the H3D, H4D-60 and X2D through
`shootflow develop` took 18, 24 and 36 s with numpy on this container.

**The check's first version was wrong, and so is the MRW check's.** It undid LibRaw's render with the
sRGB curve, but LibRaw's default output curve is BT.709 (power 2.222, slope 4.5). On dark frames that skews
the channels: the CF132, CFV and X1D showed gaps of 0.027-0.036, and the CFV's per-channel ratio to LibRaw
looked like 1.35 / 1.46 / 1.66 when it is 1.000 / 1.000 / 1.000 in linear light. Asking LibRaw for
`gamma=(1, 1)` fixed it. `tools/mrw_develop_check.py` makes the same mistake, so its 0.003-0.016 gaps
(`eval/minolta-mrw-reader-2026-11-18.md`) overstate the difference; rerunning it needs the MRW files again.

## What is left

- Phocus `.fff` files (the H5D, H6D and X2D's tethered exports on raw.pixls.us) are TIFFs too, but not
  checked: they stay culled from the preview.
- Multi-shot frames (H6D-400c MS: four samples per sensel) are refused.
- No real file uses predictor 11.
- `tools/mrw_develop_check.py`'s BT.709 mistake (above).
