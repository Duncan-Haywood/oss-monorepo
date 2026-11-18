# Canon CR3 C-RAW in several tiles, checked against LibRaw (2026-11-16)

Flagship item: "Tiled C-RAW: re-tile a real R8 for LibRaw (eval/canon-cr3-tiled-*)". Until today
`cr3.check_supported` refused a C-RAW sensor stored in tiles and pointed to Adobe's DNG Converter. That was the
last CR3 layout ShootFlow refused.

## Why it is harder than full-quality tiles

A full-quality tile is an independent band (`eval/canon-cr3-tiled-2026-11-15.md`). A C-RAW tile is a
three-level 5/3 wavelet decomposition, and the filter reaches across the seam. From the format as LibRaw's
`crx.cpp` decodes it (read for the format; no code copied):

- each tile is its own decomposition, with its first sample even at every level (so a tile whose origin is odd
  at some level, a 619-wide plane tile for example, is not a window of a whole-plane transform);
- its subbands carry coefficients lent by its neighbours: one more high-pass coefficient before a left (or
  top) neighbour, and after a right (or bottom) one 0-2 high and 0-2 low per level, from a 144-entry table
  indexed by level count and the tile's size mod 8 (`exCoefNumTbl`; `cr3_wavelet.EX_COEF`, `tile_geometry`);
- with them the inverse uses the interior lifting rule across the seam instead of the symmetric edge, and each
  level rebuilds the next level's low band including its borrowed edge (`level_sizes`);
- each tile has its own QP grid at the tile's size; a borrowed coefficient takes the step of the nearest own
  column. For rows LibRaw subtracts the bottom count where columns subtract the left one; followed as LibRaw
  reads it, clamped (`step_row`).

The Python reference (`cr3_wavelet.inverse_53`/`inverse_level` with neighbour flags) and the C decoder
(`shootflow_craw_plane`, now one tile and plane per call) implement it. The one-tile path is the same code
with no neighbours; every earlier test passes unchanged.

## How it was checked

No public tiled C-RAW file exists to test with (raw.pixls.us still refuses this container; the
metadata-extractor-images CR3s are one tile). `tools/cr3_craw_tiled_libraw_check.py` makes them:

1. decode a real one-tile C-RAW (two EOS R8 frames, one EOS R3) and check every sensel equals LibRaw 0.22
   (rawpy 0.25) `raw_image`;
2. code those sensels as tiles with `tests/craw_tiled.py`: each tile's decomposition is lifted over the tile
   and up to 48 real sensels around it, keeping only values every input of which was real (no edge extended
   except the sensor's own), then cut to `tile_geometry`'s windows. A window that needs a value the margin did
   not give raises `MarginError` instead of writing a wrong file;
3. splice the sample into a copy of the real file (`cr3_tiled_libraw_check.splice`) and decode it with LibRaw and
   with both of our engines.

Two codings per layout. **Lossless**: every step 1, so both readers must return the original sensels; this tests
the band sizes, the borrowed coefficients and the inverse at the seams. **Quantised**: the file's own step
multipliers and bases, each tile taking the window of the file's QP grid under it, coefficients divided by
their step; the readers return a lossy picture and must return the same one, which tests the step each
borrowed coefficient takes.

## Result: tiles side by side

Rows in `canon-cr3-craw-tiled-libraw-2026-11-16.jsonl`. "Differ" counts sensels of 25.5 M (R8) or 25.7 M (R3).

| file | tile (sensor) | grid | plane tiles (w) | coding | LibRaw vs original | ours C vs LibRaw | ours Python vs LibRaw | C s |
|---|---|---|---|---|---|---|---|---|
| IMG_0041.CR3 | 3096 x 4120 | 2 x 1 | 1546, 1548 | lossless | 0 | 0 | 0 | 0.63 |
| IMG_0041.CR3 | 3096 x 4120 | 2 x 1 | 1546, 1548 | quantised | 76,395 (RMS 0.58) | 0 | 0 | 0.56 |
| IMG_0041.CR3 | 2048 x 4120 | 4 x 1 | 22, 1024 | lossless | 0 | 0 | 0 | 0.61 |
| IMG_0041.CR3 | 2048 x 4120 | 4 x 1 | 22, 1024 | quantised | 19,933 (RMS 0.08) | 0 | 0 | 0.71 |
| IMG_0041.CR3 | 4096 x 4120 | 2 x 1 | 1046, 2048 | lossless | 0 | 0 | 0 | 0.85 |
| IMG_0041.CR3 | 4096 x 4120 | 2 x 1 | 1046, 2048 | quantised | 16,804 (RMS 0.07) | 0 | 0 | 0.61 |
| IMG_0041.CR3 | 1238 x 4120 | 5 x 1 | 618, 619 | lossless | 0 | 0 | 0 | 0.67 |
| IMG_0041.CR3 | 1238 x 4120 | 5 x 1 | 618, 619 | quantised | 14,799,451 (RMS 13.03) | 0 | 0 | 0.67 |
| IMG_0041.CR3 | 2200 x 4120 | 3 x 1 | 894, 1100 | lossless | 0 | 0 | 0 | 0.7 |
| IMG_0041.CR3 | 2200 x 4120 | 3 x 1 | 894, 1100 | quantised | 176,343 (RMS 0.72) | 0 | 0 | 0.7 |
| _MG_0045.CR3 | 3096 x 4120 | 2 x 1 | 1546, 1548 | lossless | 0 | 0 | - | 0.68 |
| _MG_0045.CR3 | 3096 x 4120 | 2 x 1 | 1546, 1548 | quantised | 149,296 (RMS 0.7) | 0 | - | 0.65 |
| _MG_0045.CR3 | 1238 x 4120 | 5 x 1 | 618, 619 | lossless | 0 | 0 | - | 0.74 |
| _MG_0045.CR3 | 1238 x 4120 | 5 x 1 | 618, 619 | quantised | 14,828,286 (RMS 12.99) | 0 | - | 0.63 |
| Canon EOS R3.cr3 | 3096 x 4152 | 2 x 1 | 1548 | lossless | 0 | 0 | - | 0.64 |
| Canon EOS R3.cr3 | 3096 x 4152 | 2 x 1 | 1548 | quantised | 360,882 (RMS 0.39) | 0 | - | 0.8 |
| Canon EOS R3.cr3 | 2000 x 4152 | 4 x 1 | 96, 1000 | lossless | 0 | 0 | - | 0.65 |
| Canon EOS R3.cr3 | 2000 x 4152 | 4 x 1 | 96, 1000 | quantised | 1,246 (RMS 0.01) | 0 | - | 0.76 |
| Canon EOS R3.cr3 | 1240 x 4152 | 5 x 1 | 616, 620 | lossless | 0 | 0 | - | 0.71 |
| Canon EOS R3.cr3 | 1240 x 4152 | 5 x 1 | 616, 620 | quantised | 441,523 (RMS 0.42) | 0 | - | 0.88 |

Every side-by-side layout: LibRaw and both of our engines return the same sensels, lossless (equal to the
original) and quantised. The grids cover plane tiles of 1546-2048, an odd width (619), the narrowest edge
tile LibRaw allows (22) and five tiles across. The quantised rows' distance from the original is the cost of
re-quantising with a QP window that is not aligned to the tile (largest on the 619-wide tiles, whose origins
fall between the grid's 8-column cells); it is not a reader difference. Speed with the C decoder is that of a
one-tile file (0.6-0.9 s for 25.5 M sensels); pure Python 33-38 s.

## Where LibRaw and ShootFlow part: tiles stacked one above another

Lossless, `IMG_0041.CR3` (LibRaw 0.22 via rawpy, and LibRaw master 86c4d21 built here, which gives the same
counts):

| layout | grid | LibRaw differing from original | ours (C and Python) |
|---|---|---|---|
| 6188 x 2060 | 1 x 2 | 160,305 (rows 1025-1037 of each plane only) | 0 |
| 6188 x 2000 | 1 x 3 | 370,013 | 0 |
| 2048 x 2000 | 4 x 3 | refuses: "Data error or unsupported file format" | 0 |

Reading `crx.cpp` shows one cause. In `crxIdwt53FilterTransform` the test for a tile below
(`E_HAS_TILES_ON_THE_BOTTOM`) is nested inside the end-of-tile test (`curLine >= height - 3`), so for a tile with
a neighbour below, the last rows are never computed (the getter then hands out stale line buffers), and the
`else` branch's own "odd height at the end" case can never run. `crxIdwt53FilterDecode` tests the two together,
`height - 3 <= curLine && !BOTTOM`, which is evidently what Transform meant. LibRaw master rebuilt with the two
tests combined returns the 1 x 2 file's upper tile exactly (rows 1025-1029 now equal). The first 8 rows of the
lower tile still differ, in every column of all four planes, deterministically. This run could not trace that
second difference: reading the TOP branch of `crxIdwt53FilterInitialize` it matches ours line for line, and
instrumenting the rebuilt LibRaw further was not possible in this session.

So: **side-by-side tiles**, the layout wide sensors (R5 class) use, are confirmed by an independent reader.
**Stacked tiles** are read by the same seamless rule; LibRaw does not reproduce the seam rows (one cause is its
bug), and nothing independent confirms ours there. `parse_cr3` adds a note to such a frame. A real tiled
C-RAW from a Canon body would settle both this and the QP row rule.

## Tests

`tests/test_cr3_wavelet.py` `TiledCrawTests` (8 tests): one-tile geometry equals `band_sizes`; a left neighbour
lends exactly one high-pass coefficient; the 1-D inverse across a seam returns the window at odd and even
origins; six whole tiled C-RAW files (2 x 2 uneven, 2 across, 2 down, odd 29- and 27-sensel plane tiles in a
3 x 2 grid, a 3 x 3 grid; 1-3 levels) read back sensel for sensel on both engines; quantised tiles with random
QPs give identical output on both engines; a too-narrow margin is refused by the encoder; a tile header naming
the wrong tile is refused; `parse_raw` develops a tiled frame and notes stacked tiles. Tests that changed: the
two that used a tiled C-RAW as the example of an unreadable CR3 (`test_cr3.py`, `test_ffmpeg_pipeline.py`) now
use an unknown codec version.

Hand mutations of `cr3_wavelet.py`, each run against `test_cr3_wavelet`: the interior rule at the last edge
ignored (10 tests fail), the left neighbour's extra coefficient dropped (13), top and bottom flags swapped (12),
the next level's width taken from the wrong band (10), the borrowed first high coefficient ignored in the
inverse (9), the QP row rule changed to subtract the top count (1, the engines-agree test).

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set cr3)
    PYTHONPATH=src:tests:tools /tmp/v/bin/python tools/cr3_craw_tiled_libraw_check.py mei/cr3/IMG_0041.CR3 \
        --tiles 3096x4120,2048x4120,4096x4120,1238x4120,2200x4120 --quantised --engines c,python
    PYTHONPATH=src:tests:tools /tmp/v/bin/python tools/cr3_craw_tiled_libraw_check.py mei/cr3/_MG_0045.CR3 --tiles 3096x4120,1238x4120 --quantised
    PYTHONPATH=src:tests:tools /tmp/v/bin/python tools/cr3_craw_tiled_libraw_check.py "mei/cr3/Canon EOS R3.cr3" \
        --tiles 3096x4152,2000x4152,1240x4152 --quantised
    # stacked tiles (LibRaw differs; see above)
    PYTHONPATH=src:tests:tools /tmp/v/bin/python tools/cr3_craw_tiled_libraw_check.py mei/cr3/IMG_0041.CR3 --tiles 6188x2060,6188x2000,2048x2000
