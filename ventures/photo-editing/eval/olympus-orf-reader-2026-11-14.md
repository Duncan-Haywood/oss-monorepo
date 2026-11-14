# Olympus ORF read directly, against LibRaw (2026-11-14)

## Why

The developer read DNG, Canon CR2, Sony ARW and Nikon NEF. An Olympus or OM System photographer
still had to run every file through Adobe's DNG Converter before `shootflow develop` or the
pipeline's grade stage would take it. "ORF or RW2 read directly (public files, LibRaw check)" led
the flagship's `next:` list. It needed only public sample files: a sparse checkout of `orf/` from
`drewnoakes/metadata-extractor-images` on GitHub, which the proxy serves. That gave 18 ORFs, from
the 2002 C-5050 Zoom to the 2022 OM-1 and the 2023 TG-7.

## What was built

`src/shootflow/orf.py`, on the standard library, with the decode also in C (`ljpeg_native`'s
optional ctypes library, built on first use):

- **Olympus compressed**: one MSB-first bit stream after a 7-byte header. Each row keeps three
  running values per column parity. Each sensel reads a 3-bit low/sign field, a unary
  leading-zero count (twelve zeros escape to a `16 - nbits` field) and `nbits` more bits. The
  prediction is the edge rule or a median-style rule (the mean of left and up on gentle slopes,
  `left + up - upleft` on steep ones). The TIFF tags say "uncompressed, 16-bit", so the layout is
  told by strip size, as dcraw does: any strip that is not exactly 12 or 16 bits per sensel is
  compressed. A first draft used "fewer than 12 bits per sensel", and the test encoder's noisy
  field broke it at 12.7 bits. The real TG-4 frame already holds 11.3, so a noisier frame would
  have broken it too.
- **12-bit packed, interlaced** ("IIRS" header; the C-5050 Zoom, C-8080, SP-350 and SP-500 UZ):
  even rows first, then the odd rows from the next 2048-byte boundary. This was found by searching
  each file for LibRaw's rows: row 1 sits at 963.05 row-widths on the C-5050 Zoom, which is
  `ceil(963 x 3864 / 2048) x 2048` bytes. The TIFF describes one row fewer than the camera stored
  when the height is odd (1925 of 1926). The extra row is in the file past the strips and is read.
- **Maker note** (the three layouts `lens_profiles.olympus_equipment` already reads):
  ImageProcessing (0x2040) gives BlackLevel2 (0x0600, in the order R, Gr, Gb, B), WB_RBLevels
  (0x0100, over 256) and CropLeft/Top/Width/Height (0x0612-0x0615). The older compacts give
  RedBalance and BlueBalance (0x1017/0x1018) instead. The CFA comes from the EXIF CFAPattern.
- Wired into `raw_develop.parse_raw`, the colour gate (a `.dcp` is required, as for CR2, ARW and
  NEF), `camera_profiles.camera_of` ("Olympus E-M10", "OM Digital Solutions OM-1"), the CLI's
  `--dcp FOLDER` and the pipeline's grade stage (`raw_preview.needs_profile_path`).

## Check

Run: `PYTHONPATH=src python tools/orf_libraw_check.py orf/*.orf --engines native,python`, with
rawpy (LibRaw 0.22.2) and numpy in a venv. Raw rows: `eval/olympus-orf-libraw-2026-11-14.jsonl`.

| file | storage | sensels | differing (C / Python) | WB R/G, B/G (= LibRaw) | black (per CFA position, = LibRaw) | CFA | LibRaw white | read s (C / Python) |
|---|---|---|---|---|---|---|---|---|
| OM System TG-7 | compressed | 12,184,640 | 0 / 0 | 2.0469, 1.4141 | 257 x4 | GRBG | 4095 | 0.32 / 11.4 |
| OM System OM-1 | compressed | 20,420,640 | 0 / 0 | 2.4141, 1.5313 | 255, 254, 254, 255 | RGGB | 4095 | 0.49 / 18.9 |
| C-5050 Zoom | packed, interlaced | 4,961,376 | 0 / 0 | 1.3672, 1.6094 | 0 | BGGR | 4095 | 0.05 / 0.04 |
| C-8080 | packed, interlaced | 8,049,120 | 0 / 0 | 2.1602, 1.7227 | 0 | BGGR | 4095 | 0.09 / 0.09 |
| E-M10 | compressed | 16,110,080 | 0 / 0 | 2.0938, 1.6172 | 254 x4 | RGGB | 4095 | 0.29 / 14.1 |
| E-M5 | compressed | 16,110,080 | 0 / 0 | 2.0156, 1.8906 | 254, 255, 255, 254 | RGGB | 4065 | 0.26 / 14.5 |
| E-PL7 | compressed | 16,110,080 | 0 / 0 | 1.8906, 1.7734 | 254 x4 | RGGB | 4095 | 0.31 / 14.5 |
| E-PM1 | compressed | 12,403,200 | 0 / 0 | 1.5781, 2.0938 | 64 x4 | RGGB | 4095 | 0.19 / 10.5 |
| E-30 | compressed | 12,644,400 | 0 / 0 | 2.2188, 1.1328 | 65, 65, 65, 64 | BGGR | 4028 | 0.22 / 11.1 |
| E-410 | compressed | 10,416,000 | 0 / 0 | 1.9531, 1.3750 | 72 x4 | RGGB | 3946 | 0.22 / 9.5 |
| E-600 | compressed | 12,644,400 | 0 / 0 | 1.8516, 1.2891 | 65 x4 | BGGR | 4015 | 0.25 / 11.3 |
| E-P3 | compressed | 12,403,200 | 0 / 0 | 2.0625, 1.5156 | 64, 64, 64, 65 | RGGB | 4095 | 0.31 / 11.5 |
| E-PL1 | compressed | 12,644,400 | 0 / 0 | 1.8125, 1.2812 | 65, 64, 64, 64 | RGGB | 4095 | 0.25 / 11.4 |
| SP-350 | packed, interlaced | 8,049,120 | 0 / 0 | 1.6641, 1.7852 | 0 | RGGB | 4095 | 0.15 / 0.12 |
| SP-500 UZ | packed, interlaced | 5,998,176 | 0 / 0 | 2.0586, 1.4844 | 0 | GBRG | 4095 | 0.08 / 0.07 |
| TG-4 | compressed | 16,110,080 | 0 / 0 | 1.7578, 1.7031 | 302, 302, 304, 303 | GRBG | 4095 | 0.48 / 17.0 |
| TG-6 | compressed | 12,184,640 | 0 / 0 | 2.0469, 1.4219 | 257 x4 | GRBG | 4095 | 0.31 / 12.2 |
| XZ-1 | compressed | 10,156,800 | 0 / 0 | 1.9922, 1.8516 | 67 x4 | RGGB | 4095 | 0.25 / 9.4 |

Of the 219,600,432 sensels across 18 bodies, every one is equal to LibRaw's on both decoders. The
as-shot balance, the black level at each CFA position and the CFA pattern are also equal on all
18. Balance is compared unrounded: the OM-1's 392/256 = 1.53125 prints as 1.5312 from LibRaw's
float and as 1.5313 from 1 / (1 / x). The timings above come from a run before the crop tags were
read; the jsonl holds the timings of the final run. The C decoder is about 40 to 50 times faster
than the Python reference.

End to end: `shootflow develop --dcp FOLDER --half` on the E-M10, OM-1 and E-30 frames, with
placeholder profiles made by `tests/test_arw.make_profile`, took 2.2 s for all three with numpy.
Each profile was picked by camera name, the camera's crop was applied (4608 x 3456 at (8, 8);
5184 x 3888 at (12, 12); 4032 x 3024 at (30, 26)) and the E-30's portrait orientation was honoured.

## Findings

- **Edge columns that are not picture.** The 4100-wide E-30, E-600 and E-PL1 end in four columns
  at black level (column means 67-69 against a black of 65). The 4040-wide TG-6 and TG-7 end in
  dim columns (183-200 against a picture mean near 760). The 4080-wide E-P3 and E-PM1 have a column
  at black level among brighter ones in their last six. LibRaw trims these by per-width rules (4100 to 4096,
  4080 to 4056, TG-6 to 4014). The maker note's crop, the camera JPEG's frame, leaves all of them
  out on every body that has one, so it becomes the DNG DefaultCrop here.
- **White level.** No tag in these files gives one. LibRaw lowers it from a per-model table on 4
  of 18 bodies (E-30 4028, E-600 4015, E-M5 4065, E-410 3946); 4095 is used here. On those
  bodies, highlights between LibRaw's level and 4095 will not render as clipped white.
- **The prediction reads the stored values as unsigned 16-bit.** A residual that pushes a value
  below 0 wraps, and the next prediction sees the wrapped value. Both decoders keep that, and the
  real files never hit it.

## Not done

- A real Adobe `.dcp` for an Olympus body: colour is checked only through the sensor data and the
  balance, not against Adobe's rendering.
- The per-model white levels above.
- 12-bit packed without interlace, and 16-bit unpacked (E-1, E-300, E-500 era). No test file was
  at hand, so these are refused with a message.
- The E-M1 Mark III's and OM-1's 80 MP high-res composites (no sample).
- Panasonic RW2, the other half of the `next:` item: the same collection has four real RW2s
  (GF1, GF3, GF7, LX7).
