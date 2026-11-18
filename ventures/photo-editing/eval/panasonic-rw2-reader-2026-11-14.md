# Panasonic RW2 read directly, against LibRaw (2026-11-14)

## Why

The developer read DNG, Canon CR2, Sony ARW, Nikon NEF and Olympus ORF. A Panasonic Lumix
photographer still had to run every file through Adobe's DNG Converter before `shootflow develop`
or the pipeline's grade stage would take it. "RW2 read directly (GF1, GF3, GF7, LX7 public; LibRaw
check)" led the flagship's `next:` list. It needed only public sample files: a sparse checkout of
`rw2/` from `drewnoakes/metadata-extractor-images` on GitHub, which the proxy serves. That gave four
camera RW2s (the 2009 GF1, 2011 GF3, 2012 LX7 and 2015 GF7) and a 368-byte stub (`Issue 419.rw2`,
a header with nothing behind it), which is refused (`IFD offset 24576 is outside the file`).

## What was built

`src/shootflow/rw2.py`, on the standard library, with the decode also in C (`ljpeg_native`'s
optional ctypes library, built on first use):

- **Header.** "IIU\0": TIFF with 0x55 where the magic 42 goes. `raw_develop._Reader` now accepts it
  (`RW2_MAGIC`). IFD0 holds Panasonic's tags from 0x01 up beside the usual Make and Model.
  StripOffsets is 0xFFFFFFFF on all four; the sensor data starts at RawDataOffset (0x118).
- **RawFormat 4** (tag 0x2D, compression 34316), on all four bodies. The data is read in
  0x4000-byte blocks, each stored rotated: its last 0x1FF8 bytes come first (dcraw's `load_flags`
  0x2008). Inside a block, a 17-bit bit position counts down from the top; the byte read is
  `(position >> 3) ^ 0x3FF0` and the next, little-endian. Every run of 14 sensels on a row resets a
  prediction and a "seen non-zero" flag per column parity. Sensels 2, 5, 8 and 11 of the run each
  read a 2-bit code for a shift `4 >> (3 - code)` (0, 1, 2 or 4). A parity's first value is 8 bits
  (plus 4 more when they are non-zero, or always on the run's last two sensels); after that, an 8-bit
  step `j` moves the prediction to `(pred - (0x80 << shift)) + (j << shift)`, keeping only the low
  `shift` bits of the lowered prediction when it goes negative or the shift is 4; `j = 0` repeats it.
- **Tags.** SensorWidth/Height (0x02/0x03) are the stored size. Sensor borders (0x04-0x07: top,
  left, bottom, right) become the DNG DefaultCrop. CFAPattern (0x09): 1 RGGB, 2 GRBG, 3 GBRG, 4
  BGGR. Black (0x1C-0x1E, per colour) plus 15. White: the linearity limit (0x0E-0x10) when it is at
  most 4095, else 4095. As-shot balance: WBRedLevel/Green/Blue (0x24-0x26), else RedBalance and
  BlueBalance (0x11/0x12, over 256; not on these four bodies, so untested on a real file).
- Wired into `raw_develop.parse_raw`, the colour gate (a `.dcp` is required, as for CR2, ARW, NEF
  and ORF), `camera_profiles.camera_of` ("Panasonic DMC-GF7", the name Adobe files its profiles
  under), the CLI's `--dcp FOLDER` and the pipeline's grade stage (`raw_preview.needs_profile_path`).

## Check

Run: `PYTHONPATH=src python tools/rw2_libraw_check.py rw2/Panasonic*.rw2 --engines native,python`,
with rawpy (LibRaw 0.22.2) and numpy in a venv. Raw rows: `eval/panasonic-rw2-libraw-2026-11-14.jsonl`.

| camera | stored sensels | differing (C / Python) | WB R/G, B/G (= LibRaw) | black (= LibRaw) | CFA | crop x, y, w, h (= LibRaw) | white (ours / LibRaw) | read s (C / Python) |
|---|---|---|---|---|---|---|---|---|
| DMC-GF1 | 12,244,960 | 0 / 0 | 1.8441, 1.5361 | 15 x4 | GBRG | 8, 4, 4000, 3000 | 4095 / 3986 | 0.13 / 8.1 |
| DMC-GF3 | 10,988,544 | 0 / 0 | 1.9962, 1.4340 | 143 x4 | GBRG | 8, 4, 4000, 2672 | 4095 / 4095 | 0.08 / 8.0 |
| DMC-GF7 | 16,682,624 | 0 / 0 | 2.5859, 1.4453 | 143 x4 | BGGR | 8, 8, 4592, 3448 | 4095 / 4095 | 0.15 / 11.3 |
| DMC-LX7 | 10,171,392 | 0 / 0 | 1.7396, 1.8189 | 143 x4 | GRBG | 8, 8, 3648, 2736 | 4095 / 4095 | 0.07 / 6.8 |

All 50,087,520 stored sensels on the four bodies equal LibRaw's `raw_image` on both decoders,
including the columns past the right border. The as-shot balance, the black level at each CFA
position, the CFA pattern and the crop (LibRaw's `crop_*` sizes) are equal on all four. The C
decoder is 60 to 100 times faster than the Python reference.

End to end: `shootflow develop --dcp FOLDER --half --format png` on the GF7, LX7 and GF1 frames,
with placeholder profiles made by `tests/test_arw.make_profile`, took 3.9 s for all three with
numpy. Each profile was picked by camera name and the sensor-border crop was applied (half size:
2296 x 1724, 1824 x 1368, 2000 x 1500). The three masters were looked at: a tree-lined park, a
photographed terminal screen and an aerial view of a dry riverbed, upright and with no mosaic or
block artefacts.

`tests/test_rw2.py` (9 tests) has an RW2 encoder of its own. It takes values, picks the smallest
shift that codes each three-sensel group, and writes every code where the decoder's block
addressing reads it, failing if two codes would share a bit. Its fields are made from random valid
shifts and steps (most small, some large), coded back from the values alone; a 154 x 300 field
fills four blocks and uses all four shifts. Both decoders give the field back exactly.

## Findings

- **The columns past the right border are not optical black.** Their medians are 201 to 1,140
  against a black of 143 (GF1: 492 against 15), and they reach 5,463, above the 12-bit range. They
  are not a black reference, and the crop leaves them out. LibRaw decodes them the same way, so they
  are what the file holds.
- **Values a little over 4095 inside the picture.** The LX7 frame has 1,630 sensels at 4097 inside
  its crop and the GF7 frame 5; LibRaw's own sanity check only complains above 4098. They are
  clipped highlights. White is 4095 here, so they render as white.
- **The GF1 clips at about 3,975, not 4095.** Its brightest sensel inside the crop is 3,975, and
  LibRaw's per-model white level is 3,986. The file's linearity-limit tags say 16383, so this reader
  uses 4095. Highlights clipped on a GF1 will render as a light grey about 0.04 stops under white.
- **Black plus 15.** LibRaw's black is the tag plus 15 on all four bodies (128 to 143 on three, 0 to
  15 on the GF1). Whether Adobe's converter does the same was not checked.

## Not done

- A real Adobe `.dcp` for a Panasonic body: colour is checked only through the sensor data and the
  balance, not against Adobe's rendering. The GF7 also carries a colour matrix of its own (tags
  0x11C-0x120), which is not read yet.
- The GF1's lower white level (above).
- RawFormat 5 and later (14-bit and newer 12-bit block layouts from the GH5 on) and older 16-bit
  RW2s: no test file was at hand, so they are refused with a message.
- Lumix lens names. The EXIF IFD that IFD0 points at (0x8769) holds focal length but no LensModel
  and no maker note on all four files, so the lensfun stage finds no lens for an RW2 and says so.
  Panasonic keeps the full EXIF, maker note included, in the embedded JPEG (tag 0x2E,
  JpgFromRaw); reading the lens from there is the next step for lens correction of RW2s.
