# Nikon NEF read directly, against LibRaw (2026-11-14)

## Why

The developer read DNG, Canon CR2 and Sony ARW; every Nikon file had to go through Adobe's DNG
Converter first, so a photographer on a Nikon body could not use `shootflow develop` or the
pipeline's grade stage on their own files. "Nikon NEF read directly (public NEFs; LibRaw as the
check)" was the first item of the flagship's `next:`. It needed only public sample files, which the
proxy serves (`github.com` clone of `drewnoakes/metadata-extractor-images`, sparse checkout of
`nef/`).

## What was built

`src/shootflow/nef.py`:

- **Nikon compressed (34713)**: the six fixed code tables (12- and 14-bit; lossy, lossy after a
  split row, lossless), MSB-first bits with no byte stuffing, column 0 and 1 predicted from two
  rows up and every other sensel from two columns left, 16-bit wrap, clamp to 0..0x3FFF, the
  linearisation curve. The curve, starting predictions and split row come from the maker note's
  tag 0x0096: version 0x46 (lossless, identity curve), 0x44 0x10 (lossy, the curve stored in
  full), 0x44 0x20 (lossy, curve points every `2^bits / (n-1)` values interpolated linearly, split
  row at byte 562). The format as dcraw and LibRaw read it; an independent implementation.
- **Uncompressed (1)**: packed 12/14-bit MSB-first rows, or 16-bit words, across all strips.
- Levels and balance from the type-3 maker note: WB_RBLevels (0x000C) for the as-shot balance,
  BlackLevel (0x003D) where present (D810: 600; older bodies store black-subtracted data, level 0),
  white level from the top of the stored curve, else `2^bits - 1`. CFA from the raw IFD's
  CFAPattern tag.
- A pure-Python decoder (the reference) and the same decode in C (`shootflow_nikon_run`, added to
  the optional ctypes library in `ljpeg_native.py`; built on first use, off with
  `SHOOTFLOW_NATIVE=0`).
- Wired into `raw_develop.parse_raw`, the colour gate (a `.dcp` profile is required, as for CR2
  and ARW), `camera_profiles.camera_of` (camera "Nikon D810", as Adobe's profiles spell it),
  `raw_preview.needs_profile_path` (so the pipeline's grade stage develops NEFs with the
  workspace's `color/camera-profiles/`) and the CLI's `--dcp FOLDER`.

## Check

`PYTHONPATH=src python tools/nef_libraw_check.py nef/Nikon*.nef --engines native,python` with
rawpy (LibRaw 0.22.2) and numpy in a venv. Raw rows: `eval/nikon-nef-libraw-2026-11-14.jsonl`.

| file | storage | sensels | differing (C / Python) | WB R/G, B/G (ours = LibRaw) | black | read s (C / Python) |
|---|---|---|---|---|---|---|
| D70 | lossy 12-bit, full curve | 6,122,560 | 0 / 0 | 2.0717, 1.5896 | 0 | 0.10 / 4.2 |
| D200 | uncompressed 12-bit | 10,212,864 | 0 / 0 | 1.5508, 1.5469 | 0 | 0.14 / 0.12 |
| D300 | lossless 12-bit | 12,481,536 | 0 / 0 | 1.7305, 1.1875 | 0 | 0.21 / 8.8 |
| D90 | lossy 12-bit, stepped curve | 12,481,536 | 0 / 0 | 1.3398, 1.7891 | 0 | 0.19 / 8.9 |
| D5100 | lossy 14-bit, stepped curve | 16,373,760 | 0 / 0 | 2.1133, 1.3281 | 0 | 0.27 / 11.9 |
| D800E | lossless 14-bit | 36,555,776 | 0 / 0 | 2.0000, 1.4883 | 0 | 0.58 / 26.0 |
| D810 | lossless 14-bit | 36,368,640 | 0 / 0 | 1.9688, 1.2656 | 600 | 0.60 / 29.4 |

130,596,672 sensels, every one equal on both decoders; CFA (RGGB, BGGR, GBRG, GRBG across the
seven) and black level equal on all seven. The four `Issue 247-*.nef` files in the collection are
JPEGs with a NEF name, not raw files, and were left out.

An end-to-end `shootflow develop --dcp FOLDER --half` of the D810, D70 and D200 files (with
placeholder profiles from `tests/test_arw.make_profile`, so the colour is not Adobe's) chose each
profile by camera name, applied the D810's 600 black and each file's orientation (the D810 frame
comes out portrait, 2464 x 3690), in 2.4 s for all three with numpy.

## Findings

- **White level, D5100.** LibRaw reports 15,846; ours is 16,383, the top of the file's own curve.
  LibRaw's own `raw_image` for that frame holds sensels up to 16,383, so 15,846 (a per-model
  value from LibRaw's table) would clip values the camera stored. The checker reports the white
  level and does not gate on it.
- **No split row in any of the seven.** The two lossy 0x44 0x20 files (D90, D5100) store split
  row 0, so the after-split tables (whose symbols scale differences, `shl > 0`) ran only on the
  synthetic files `tests/test_nef.py` writes. A real file with a non-zero split is wanted.
- **Every code table is complete**: each fills the 16-bit prefix space exactly (Kraft sum 1), so
  no Nikon stream can hold an invalid code; truncated data reads as zero bits on both decoders.
- The C decoder is 40-50x faster than the pure-Python reference (0.6 s against 26-29 s for a
  36 MP frame).

## Not done

A real Adobe `.dcp` for a Nikon body (colour is checked only through LibRaw's sensor data and
balance, not a rendered colour against Adobe's); the masked columns LibRaw trims by a per-model
table (D800E: 7,424 stored, 7,378 visible; D200: 2 on the left); a real file with a non-zero split
row; Nikon's high-efficiency NEF (Z bodies, TicoRAW) and Coolpix NEFs are refused; Nikon's
encrypted ColorBalance (0x0097) is not read (0x000C agreed with LibRaw on all seven).
