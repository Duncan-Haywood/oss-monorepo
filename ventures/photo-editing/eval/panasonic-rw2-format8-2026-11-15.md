# Panasonic RW2 RawFormat 8, against LibRaw (2026-11-15)

## Why

Every Lumix body announced since 2022 (GH6, GH7, G9 II, S5 II, S1 II, S9) writes RawFormat 8, and
`rw2.py` refused it: a photographer on any current Lumix had to run Adobe's DNG Converter before
the pipeline would develop a frame. The earlier run on the same day found the files on raw.pixls.us
but the proxy refused the downloads; this run they came through (`curl -L`, 27-156 MB each).

## Files (raw.pixls.us, CC0; not committed)

Ten files from all six bodies, chosen to cover every bit depth and both tile layouts seen:

| body | file (under `https://raw.pixls.us/data/Panasonic/<body>/`) | what it covers |
|---|---|---|
| DC-GH6 | `P1000116.RW2` | 16-bit, high-resolution mode (11560 x 8680, 100 MP), 3 tiles, 1:1 in-camera crop |
| DC-GH6 | `1-1.RW2` | 16-bit, 1:1 aspect, 2 tiles |
| DC-GH7 | `P1002296.RW2` | 16-bit, 2 tiles |
| DC-G9M2 | `P1000019.RW2` | 16-bit, 2 tiles |
| DC-S5M2 | `P1126458_mechanical.RW2`, `P1126460_burst_electronic.RW2` | 14-bit, mechanical and electronic shutter |
| DC-S1M2 | `Panasonic_DC-S1M2_-_32.RW2`, `..._32_LG.RW2` | 14-bit; the LG file is the 96 MP high-resolution mode, 3 tiles |
| DC-S9 | `Panasonic_DC-S9_ISO200_3_2.RW2`, `..._LL_48MP.RW2` | 12-bit; 24 MP and the 96 MP high-resolution mode |

## The format

Read from IFD0 (all tags little-endian; the counted arrays start with a 16-bit count):

- 0x40: 17 (code length, code) pairs, one Huffman code per symbol k = 0..16; 0x41: a shift s per
  symbol (0 on every file here); 0x3C-0x3F: the four starting values (0 on every file here);
  0x3B: the largest value; 0x39/0x3A: a tone curve (identity on every file here).
- 0x42/0x43: tiles across and down; 0x44: each tile's file offset; 0x45: its left edge; 0x46: its
  length in bits; 0x47/0x48: its width and height. The tiles split the width (2 or 3 here) and
  each runs the full height.

Each tile is one bit stream, each byte read from its lowest bit. Sensels come in 2x2 blocks along
each pair of rows, coded top-left, bottom-left, top-right, bottom-right. Each sensel is a symbol
k, then k - s raw bits r (none if k <= s): the step is `r << s` when r's top bit is set and
`(r << s) - 2**k` (+1 when s is 0) when it is not, the lossless-JPEG rule, plus `2**(s-1)` when
s > 0; when k <= s the sign comes from the next bit, which is not consumed. The step is added to
the same position of the block to the left; a row pair's first block is predicted from the first
block of the pair above, and the tile's first from tags 0x3C-0x3F. Values are held to 0..tag 0x3B.

This is the format as LibRaw 0.22's `pana8.cpp` reads it (LibRaw reverse-engineered it from the
camera software and published it under LGPL 2.1/CDDL). We read that code to learn the layout and
wrote `C8Params`, `_c8_tile_python` and `shootflow_panasonic_c8_tile` independently, from the
description above; no code was copied. The shift (s > 0) path and the tone curve are LibRaw's
reading of fields no checked file uses: the shift path is implemented and tested on synthetic
streams; a file with a non-identity tone curve is refused, because no file at hand shows what its
first 16-bit field of each tag 0x3A entry means (LibRaw drops it).

## Check

`PYTHONPATH=src python tools/rw2_libraw_check.py <10 files> --engines native`, then
`--engines native,python` on the S9, S5 II and GH7, with rawpy 0.28 (LibRaw 0.22.2) and numpy.
Raw rows: `eval/panasonic-rw2-format8-libraw-2026-11-15.jsonl` (the last three rows are the
Python-reference run).

| body | file | bits, tiles | sensels | differing | WB R/G, B/G (= LibRaw) | black (= LibRaw) | CFA | crop x, y, w, h (= LibRaw) | white ours / LibRaw | read s (C / Python) |
|---|---|---|---|---|---|---|---|---|---|---|
| DC-GH6 | P1000116 (100 MP) | 16, 3 | 100,340,800 | 0 | 2.8867, 1.9531 | 2048 | RGGB | 1444, 4, 8672, 8672 | 65535 / 65535 | 1.89 |
| DC-GH6 | 1-1 | 16, 2 | 25,206,784 | 0 | 2.7617, 1.9844 | 2048 | RGGB | 728, 8, 4336, 4336 | 65535 / 65535 | 0.57 |
| DC-GH7 | P1002296 | 16, 2 | 25,206,784 | 0 | 2.5703, 1.4492 | 2048 | RGGB | 8, 8, 5776, 4336 | 65535 / 65535 | 0.55 / 13.88 |
| DC-G9M2 | P1000019 | 16, 2 | 25,125,696 | 0 | 2.6562, 1.4219 | 2048 | RGGB | 4, 4, 5776, 4336 | 65535 / 65535 | 0.64 |
| DC-S5M2 | mechanical | 14, 2 | 24,080,064 | 0 | 2.0547, 1.6641 | 512 | RGGB | 4, 4, 6000, 4000 | 16319 / 16319 | 0.54 / 12.53 |
| DC-S5M2 | burst_electronic | 14, 2 | 24,080,064 | 0 | 2.0547, 1.6641 | 512 | RGGB | 4, 4, 6000, 4000 | 16319 / 16319 | 0.56 |
| DC-S1M2 | -32 | 14, 2 | 24,080,064 | 0 | 2.0352, 1.6484 | 512 | RGGB | 4, 4, 6000, 4000 | 16319 / 16319 | 0.51 |
| DC-S1M2 | -32_LG (96 MP) | 14, 3 | 96,160,064 | 0 | 2.0352, 1.6484 | 512 | RGGB | 4, 4, 12000, 8000 | 16319 / 16319 | 1.66 |
| DC-S9 | ISO200_3_2 | 12, 2 | 24,160,256 | 0 | 2.0234, 1.7578 | 128 | RGGB | 8, 8, 6000, 4000 | 4079 / 4079 | 0.54 / 11.91 |
| DC-S9 | LL_48MP (96 MP) | 12, 3 | 96,160,064 | 0 | 2.0234, 1.7578 | 128 | RGGB | 4, 4, 12000, 8000 | 4079 / 4079 | 1.64 |

All 464,600,640 stored sensels equal LibRaw's `raw_image` on the C decoder, and on the Python
reference for the three files it was run on. The as-shot balance, the black level at each CFA
position, the CFA pattern and the crop are equal on all ten. The Python reference matched LibRaw on
its first run (checked first on 16 rows of every tile); the C port matched on its first run too.

**White level: measured, then LibRaw's margin taken.** The first run used the linearity tags as
stored (16383 at 14 bits, 4095 at 12) and the check reported LibRaw's 16319 and 4079 (64 and 16
levels lower, as on RawFormat 6 and 7). Counting the sensels in the top levels of each frame
(`raw_image`, LibRaw's numbers):

| file | sensels at the top value | in the margin below it |
|---|---|---|
| S1 II, 96 MP | 784,307 at 16383 | 474,477 at 16381-16382, about 15,000 more at 16372-16376 |
| S1 II, 24 MP | 235,149 | about 100 a level from 16320 up |
| S5 II, mechanical | 98,375 | about 20 a level |
| S9, 24 MP | 212 at 4095 | 8 |
| GH6, 100 MP (16-bit) | 14,452 at 65535 | 44,047 at 65532-65534 |

On the 96 MP S1 II frame (several exposures merged in camera) almost half a million blown sensels
sit one or two levels under the clip, and with the clip as white they would develop as not quite
saturated and tint blown highlights. So 12- and 14-bit RawFormat 8 now take LibRaw's margin.
16-bit files keep 65535, as LibRaw: the GH6's 44,047 sensels at 65532-65534 are 0.04% of the frame
and three levels in 65535 below white, under a thousandth of a stop.

End to end: `shootflow develop` on the GH7 file with a synthetic test profile (no Adobe `.dcp`
for these bodies was at hand) wrote a 5776 x 4336 16-bit master in 4.6 s with numpy, the in-camera
crop applied. Colour from a real profile is not checked here.

## Tests

`tests/test_rw2_c8.py` (7 tests) writes RawFormat 8 RW2s with an encoder of its own (canonical
Huffman codes, inverted so the long codes fit tag 0x40's 12 bits; lossless-JPEG categories; bytes
filled from their lowest bit): single-row and 2 x 2 tile grids, every symbol up to 16 at 16 bits,
both decoders; a hand-worked stream through the shift path and its sign-from-the-next-bit case;
random streams with shifts 0-3 agreeing between C and Python; partial decode; levels and white
at 12, 14 and 16 bits; refusals (tone curve, 10-bit, a stream past the end of the file, a code
that matches no symbol).

## Not done

- A file with a tone curve in tags 0x39/0x3A, or non-zero shifts or starting values: none of the
  ten has one. Refused (the curve) or read as LibRaw reads it (shifts, starting values).
- Colour: as for every RW2 here, the camera's `.dcp` is needed; the RW2's own matrix tags are
  not read.
- Lens: all ten files name their lens (the embedded JPEG's EXIF LensModel, or its maker note's
  LensType on the G9 II and both GH6 files: "LEICA DG 12-35/F2.8", "LUMIX S 24-60/F2.8", "SAMYANG
  35-150mm F2-2.8", "45mm F2.8 DG DN | Contemporary 019", ...), so `--lens-db` needs no `--lens`;
  whether lensfun has a profile for each of those lenses was not checked.
