# Every CR3 body on raw.pixls.us against LibRaw (2026-11-18)

## Why

The flagship's `next:` asked for "a CR3 a body writes in tiles". The R5 and R5 Mark II, thought to be the
tiled bodies, turned out to store one tile (`eval/canon-cr3-r5-real-2026-11-18.md`), so the tiled readers
were still checked only on our own re-stored frames. This run took one or two files of every CR3 body on
raw.pixls.us (CC0) that had not been read yet, plus a Dual Pixel R5, R8 and R6 Mark II file, and ran each
through `tools/cr3_libraw_check.py` against LibRaw 0.22.2 (rawpy 0.28.0).

## Files

39 files, 23 model names (21 cameras: the Kiss M is the M50, the SL3 the 250D), 965 MB, downloaded at check time, one at a time, and not committed. Each row of
`canon-cr3-every-body-2026-11-18.jsonl` names its raw.pixls.us path under `data/Canon/` (`url_path`, URL
escaped), the first 12 hex digits of its sha256 and the checker's row. The checker now also prints CMP1's tile
size, ColorData's length and version, and every place in ColorData that holds LibRaw's four black levels
(`black_index_found`).

## Finding 1: the older bodies store tiles, and the reader refused all of them

17 of the 39 files store the frame as two tiles side by side: every file of the EOS R, RP (full frame), M50
and Kiss M, M50 Mark II, M6 Mark II, M200, 250D, SL3, 90D, 850D and R100, 6288 to 7128 sensels wide. The
later bodies (R5, R6, R6 Mark II, R7, R8, R10, R50, R50 V, R3, R6 Mark III, 1D X Mark III, PowerShot V1)
store one tile, the R7 at the same 7128 sensels as the tiled 90D. So tiling follows the camera generation,
not the sensor width.

The code on `main` before this run refused 17 of the 18 files from the older bodies:

| refusal | files | cause |
| --- | --- | --- |
| "CMP1's several-tiles flags do not match its tile size" | 9 (every older-body RAW but the Kiss M) | the reader required CMP1's two several-tiles flags to agree with the tile grid; on these files both flags are 0 while the grid is 2 x 1 (the R100 sets the column flag, the Kiss M too) |
| "codec version 0x100 with 3 wavelet levels is not supported" | 8 (every older-body C-RAW) | these bodies write C-RAW as CMP1 version 0x100, an older layout than the R3/R8's 0x200 |

Before this run a CR3 from any of those ten bodies, Canon's best-selling ones of 2018-2020, had to go through
Adobe's DNG Converter.

## Finding 2: the older C-RAW layout

Header dump of the R100 C-RAW (`0xFF01` tile headers of 8 bytes, no QP stream; `0xFF03` subband headers
of 8 bytes):

```
0xff01 8 006bbf6800000000            tile 0: 7,061,352 bytes, index 0
0xff02 8 001b029008000000            plane 0: 1,770,128 bytes, partial flag
0xff03 8 0000bf38 00200002           band 0: 48,952 bytes; word 0x00200002
0xff03 8 0000b268 10200003           band 1: word 0x10200003
0xff03 8 00020f98 40800007           band 4: word 0x40800007
0xff03 8 000650d0 70d00000           band 7: word 0x70d00000
```

The word holds the band number (top four bits), a per-line flag (bit 27, 0 on every file here), the band's
QP (bits 19-26: 4, 4, ..., 16, ..., 26) and the padding after its bytes (low 19 bits). With no QP grid, every
coefficient of a band is multiplied by one step, `q_step(QP)` (QP 4 is 1, 16 is 4, 26 is 12), as LibRaw's
"prev. version" path does. `cr3_wavelet.read_layout` now reads these headers into the existing machinery as
a zero step multiplier and a base equal to that step, so the C decoder needed no change. Refused, with a
reason, because no file has them: the per-line flag, a QP whose step is 0 (LibRaw multiplies such a band by
0), and a tile mixing a QP stream with old-style headers.

## Finding 3: every sensel equal, on all 39

After the two fixes, `canon-cr3-every-body-2026-11-18.jsonl`: **0 of 986,825,520 sensels differ** from
LibRaw's `raw_image` with the C decoder on all 39 files (17 tiled, 17 C-RAW, 8 of them old-style), and the
as-shot white balance equals LibRaw's on all 39. The pure-Python engine agrees on the R100 (old-style C-RAW
in two tiles: 0 of 25.5 M differ, 37.8 s; C 0.65 s). C read times 0.3-1.3 s per file.

These are the first real tiled CR3s this reader has seen, in both qualities. They confirm the tile layout
read from LibRaw and checked until now only on our own re-stored R8 and R3 frames
(`eval/canon-cr3-tiled-2026-11-15.md`, `eval/canon-cr3-craw-tiled-2026-11-16.md`). Every real tiled file is
two tiles across, so tiles stacked one above another (where the seam rows disagree with LibRaw,
`cr3.py`'s note) are still unseen in a real file.

## Finding 4: black level by ColorData version, and two bodies LibRaw gets wrong

ShootFlow reads a stated PerChannelBlackLevel where its place in ColorData is known, and measures IAD1's
optical-black columns otherwise. The place was keyed by ColorData's length. One length holds two layouts,
and ColorData's first entry (its version) tells them apart:

| ColorData length, version | bodies here | black at | stated value here |
| --- | --- | --- | --- |
| 3778, 48 | R6 Mark II, R7, R8, R10, R50 | 0x16B | 512, 2048 |
| 3778, 65 | PowerShot V1, R50 V | 0x17F | 512 |
| 3778, 66 | R6 Mark III | 0x17F | 512 |
| 1816, 18 or 19; 1820, 16; 1824, 17 | M200, M50 II, M6 II, RP, 250D, SL3, 90D, 850D, R100; M50, Kiss M; EOS R | 0x149 | 509-513, 2048-2049 |

(0x16B as on the R3's 3,973 entries, 0x17F as on the R5 Mark II's 4,528; the existing table for those,
and for the R5/R6/1D X Mark III, is unchanged.) The 0x149 place was found where it holds LibRaw's four values
exactly on 9 files of versions 17-19; 0x16B on the R6 Mark II's two C-RAWs. `cr3._BLACK_INDEX_BY_VERSION`
now picks the place by (length, version), and an unseen version still measures.

What changed (black ours / LibRaw, first and second run, rows in the JSONL for the second):

| file | measured (before) | stated (now) | LibRaw |
| --- | --- | --- | --- |
| R50 C-RAW, electronic shutter | 2059/2061/2057/2055 | 2047/2048/2049/2046 | 2046/2047/2047/2045 |
| R10 IMG_6310, IMG_4276 | 2049/2049/2049/2048, 2049 x 4 | 2048 x 4 | 2047 x 4 |
| M50 RAW | 509/512/512/512 | 510/511/511/511 | 510/511/511/510 |

The R50 C-RAW's measured black was 13 levels high, which on its 14,335-level range darkens a tone five stops
under middle grey by 16 % (13 of its 81 levels above black). The stated value is within 2 of LibRaw's.

**LibRaw 0.22.2 reads a wrong black on two new bodies.** On the R6 Mark III (four files) and the PowerShot V1,
LibRaw's `black_level_per_channel` is 0/58/113/145, 0/46/100/137 or 0/32/64/96: a ramp read from 0x27C of
the version 65/66 ColorData, where the version 48 layout keeps something else. The optical-black columns
read 512.0 (std 1.0-1.1) on the R6 Mark III and 512.2 (std 2.0-2.1) on the V1, column by column across
columns 0-139 over rows 200 to height-200, and ColorData states 512 at 0x17F and again at 0x290. ShootFlow
develops these at 512; a developer taking LibRaw's figure would leave true black 367 to 512 levels above zero, per channel, a
coloured veil over every shadow. The
checker's `ok` is false on these five rows for this reason only (sensels, white balance and CFA equal).

Remaining checker failure from ShootFlow's side: the R50 C-RAW, electronic shutter, black 2 above LibRaw
at one 2x2 position (2049 vs 2047). LibRaw does not use the stated level on this file (its four values are
not in ColorData); its figure is a measurement. Left as is.

## Exit

`tools/cr3_libraw_check.py` over the 39 files: 33 ok, 5 not ok for LibRaw's black (above), 1 for the R50
C-RAW's 2-level black.

## Reproduce

```
cd ventures/photo-editing
python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
curl -L -o M200.CR3 'https://raw.pixls.us/data/Canon/Canon%20EOS%20M200/_MG_2231.CR3'
curl -L -o R100.CR3 'https://raw.pixls.us/data/Canon/Canon%20EOS%20R100/_MG_2195%5b1%5d.CR3'
PYTHONPATH=src /tmp/v/bin/python tools/cr3_libraw_check.py M200.CR3 R100.CR3 --engines c,python
```

The other 37 paths are the `url_path` fields of the JSONL.

Tests: `tests/test_cr3_wavelet.py` (`OldStyleCrawTests`: an old-style C-RAW built here reads back sensel for
sensel at step 1; per-band steps on both engines; the per-line flag, a zero step and a version 0x200 file
with no levels refused), `tests/test_cr3.py` (`test_several_tiles_flags_are_not_needed`,
`test_stated_black_place_follows_the_colordata_version`).

## Open

- A real CR3 with tiles stacked one above another (none of the 21 cameras writes one).
- Old-style C-RAW with the per-line flag set (bit 27): none seen.
- Whether LibRaw's newer snapshots read the R6 Mark III / V1 black correctly (rawpy 0.28.0 bundles 0.22.2).
