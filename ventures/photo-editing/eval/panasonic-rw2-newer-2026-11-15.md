# Panasonic RW2 RawFormat 5, 6 and 7, against LibRaw (2026-11-15)

## Why

`rw2.py` read RawFormat 4 only, checked on four bodies from 2009-2015 (GF1, GF3, GF7, LX7;
`eval/panasonic-rw2-reader-2026-11-14.md`). Every newer layout was refused "for want of a test
file". raw.pixls.us (CC0 samples) answered from this container on 2026-11-15 once curl followed its
301 to `/download/...` (`curl -L`; without it the files come back empty). One frame each was taken
from 18 Panasonic bodies made since 2017; their RawFormat tag (0x2D):

| RawFormat | bodies (one file each) |
|---|---|
| 4 | GH5, G90, G100, GX9, LX100 II, TZ200 |
| 5 | G9 (12-bit, high-resolution mode, 10480 x 7794), GH5S (14-bit) |
| 6 | S1, S1R, S1H (14-bit) |
| 7 | S5 (14-bit) |
| 8 | GH6, GH7, G9 II, S5 II, S1 II, S9 (not read; see below) |

The files are not committed (12-131 MB each). Paths: `https://raw.pixls.us/data/Panasonic/<body>/`,
the first `.RW2` in each listing.

## What was built

In `src/shootflow/rw2.py` (pure-Python references) and `ljpeg_native.py` (C, the optional ctypes
library):

- **RawFormat 7**: the sensor data from RawDataOffset is 16-byte lines; each line, as a
  little-endian 128-bit number, holds `128 // bits` sensels (9 of 14 bits, 10 of 12) from the lowest
  bit up. Found by trying the obvious packing first: 0 of 24,288,768 S5 sensels differ.
- **RawFormat 5**: the same lines, read through RawFormat 4's rotated 0x4000-byte blocks. Read in
  file order every sensel is wrong; through `rotated_blocks` none is.
- **RawFormat 6**: 11 sensels a line. Fields from the line's top bit down: 14, 14, then three groups
  of a 2-bit code and three 10-bit values (two in the last group; 124 bits used). Per column parity,
  the first value is absolute (a zero first value leaves the parity unstarted and shows its last
  non-zero value). After that, with s the group's code (3 means 4), a value is multiplied by `1 << s`
  and, while `0x200 << s` is below 0x2000 and below the parity's previous value, raised by their
  difference. Every sensel is then lowered by 15 (negative reads 0, above 0xFFFF reads 0x3FFF).
  This is the format as LibRaw's `panasonicC6_load_raw` reads it, written here independently
  (no code copied).
- **Black**: on RawFormat 5-7 the tags 0x1C-0x1E are LibRaw's black level as stored (RawFormat 4
  adds 15).
- **White**: the linearity limit (0x0E-0x10), held at the body's bit depth (was 4095 always), less
  64 on RawFormat 6 and 7 at 14 bits (16 at 12 bits, untested), as LibRaw. See "White level" below.
- **Crop**: tags 0x2F-0x32 (CropTop, CropLeft, CropBottom, CropRight), the frame the camera's
  aspect setting chose, when present and inside the stored size; else the sensor borders as before.

## Check

`PYTHONPATH=src python tools/rw2_libraw_check.py <12 files> --engines native`, then
`--engines native,python` on the S5, GH5S and S1, with rawpy 0.25 (LibRaw 0.22.2) and numpy.
Raw rows: `eval/panasonic-rw2-newer-libraw-2026-11-15.jsonl` (the last three rows are the
Python-reference run).

| body | RawFormat, bits | sensels | differing | WB R/G, B/G (= LibRaw) | black (= LibRaw) | CFA | crop x, y, w, h (= LibRaw) | white ours (after the fix below) / LibRaw | read s (C / Python) |
|---|---|---|---|---|---|---|---|---|---|
| DC-GH5 | 4, 12 | 20,550,656 | 0 | 2.3672, 1.7812 | 144/143 | RGGB | 660, 8, 3888, 3888 | 4095 / 4095 | 0.12 |
| DC-G90 | 4, 12 | 20,550,656 | 0 | 2.2109, 1.8594 | 144/143 | BGGR | 8, 8, 5184, 3888 | 4095 / 4095 | 0.13 |
| DC-G100 | 4, 12 | 20,550,656 | 0 | 2.3750, 1.8320 | 144 | BGGR | 8, 8, 5184, 3888 | 4095 / 4095 | 0.14 |
| DC-GX9 | 4, 12 | 20,550,656 | 0 | 2.2461, 1.7305 | 143 | BGGR | 656, 8, 3888, 3888 | 4095 / 4095 | 0.12 |
| DC-LX100M2 | 4, 12 | 16,652,160 | 0 | 2.4883, 1.9805 | 143 | BGGR | 8, 8, 4928, 3288 | 4095 / 4095 | 0.09 |
| DC-TZ200 (Model tag DC-TZ202) | 4, 12 | 20,108,032 | 0 | 2.5039, 1.7539 | 142 | GBRG | 312, 8, 4864, 3648 | 4095 / 4095 | 0.11 |
| DC-G9 | 5, 12 | 81,681,120 | 0 | 2.2969, 1.8789 | 127/128 | RGGB | 18, 10, 10368, 7776 | 4095 / 4095 | 0.59 |
| DC-GH5S | 5, 14 | 10,393,344 | 0 | 2.6953, 1.8242 | 509/510 | RGGB | 12, 8, 3680, 2760 | 16383 / 16383 | 0.06 / 1.02 |
| DC-S1 | 6, 14 | 24,385,152 | 0 | 2.1016, 1.8594 | 511 | RGGB | 12, 8, 6000, 4000 | 16319 / 16319 | 0.12 / 7.68 |
| DC-S1R | 6, 14 | 47,579,136 | 0 | 1.9609, 1.5273 | 510 | GBRG | 12, 24, 8368, 5584 | 16319 / 16319 | 0.22 |
| DC-S1H | 6, 14 | 24,385,152 | 0 | 2.0117, 1.8984 | 510 | RGGB | 348, 8, 5328, 4000 | 16319 / 16319 | 0.11 |
| DC-S5 | 7, 14 | 24,288,768 | 0 | 1.9062, 2.1172 | 512 | RGGB | 12, 8, 6000, 4000 | 16319 / 16319 | 0.10 / 2.19 |

All 331,675,488 stored sensels equal LibRaw's `raw_image`, on the C decoder for all twelve and on
the Python reference for the three it was run on. The as-shot balance, the black level at each CFA
position, the CFA pattern and the crop are equal on all twelve.

Before this change the six RawFormat 4 bodies already read sensel for sensel, but the GH5, GX9 and
TZ200 frames, shot at the camera's 1:1 or 4:3 aspect, were developed at the full sensor width; the
crop now matches LibRaw on all three.

**White level: first draft wrong, measured, changed.** The first version used the clip point
(16368 on RawFormat 6, after the 15 the decoder takes off; 16383 on 7) and the check tool reported
it against LibRaw's 16319 (16383 less 64), which it does not gate. Counting sensels near the top
before writing that up showed why LibRaw's margin is right:

| frame | at the hard clip | 16320 to clip-1 | 16200-16319 | mean per level, 15000-15999 |
|---|---|---|---|---|
| S1 (RawFormat 6) | 32,128 at 16368 | 152,552 (144,576 of them at 16352-16355) | 160 | 1.7 |
| S1H (6) | 32,128 at 16368 | 144,576 | 0 | n/a |
| S1R (6) | 54,376 at 16368 | 247,563 | 1,150 | n/a (1,585 sensels above 16368) |
| S5 (RawFormat 7) | 72,701 at 16383 | 5 | 10 | 0.1 |

On the S1-family files a saturated photosite reads at several levels from 16320 up, not one. With
white at 16368, the 144,576 sensels at 16352-16355 would sit just under white and, once the
channels are scaled for white balance, show as tinted highlights. White is now LibRaw's 16319 on
RawFormat 6 and 7 (the S5's clean clip costs a 0.4% scale), so the white level equals LibRaw's on
all twelve files.

End to end: `shootflow develop --dcp FOLDER --half --format png` on the S1, S5, GH5S and GH5
frames, with placeholder profiles from `tests/test_arw.make_profile` (so the colour is not the
camera's), took 6.6 s for all four with numpy. The masters were looked at: a watch on cloth, a toy
duck by a skirting board, two garden statues on a bench, a colour chart on a bench (the GH5's,
3888 x 3888 at full size), all upright with no mosaic, stripes or line-to-line shifts. Each picked
its profile by camera name and named its lens from the embedded JPEG's maker note.

`tests/test_rw2.py`: 18 tests (9 before). New: RawFormat 7 at 12 and 14 bits, RawFormat 5 through
the rotated blocks across a block boundary (and the same bytes read unrotated differ), a RawFormat
6 line worked by hand through codes 0, 1 and 3, a zero first value and the clamp, random RawFormat 6
lines equal on both decoders, the in-camera crop and its fallback, and the refusals (RawFormat 3
and 8, 12-bit RawFormat 6, a row that is not whole lines, data cut short).

## Not done

- **RawFormat 8** (GH6, GH7, G9 II, S5 II, S1 II, S9): a Huffman-coded layout (LibRaw's
  `panasonicC8_load_raw`). The six sample files above are the test set for it.
- Rows that are not whole 16-byte lines on RawFormat 5-7 are refused; no file has one.
- LibRaw fills only whole 16-row groups on RawFormat 6 and 7 (a 4016-row frame is 251 of them, so
  every file here is whole); this reader decodes every row.
