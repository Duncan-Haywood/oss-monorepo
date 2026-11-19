# The S1R II's 177 MP frame against a second decoder: LibRaw's November snapshot (2026-11-18)

## Why

Earlier today (`eval/panasonic-rw2-format8-grid-2026-11-18.md`) the reader learned to open
`DC-S1RM2/P1000450.RW2` from raw.pixls.us (CC0): the Lumix S1R II's high-resolution mode, 16296 x 10856
sensels in a 4 x 2 grid of RawFormat 8 tiles. LibRaw 0.22.2 (the one rawpy 0.28 bundles) refused it, so
the decode was judged by indirect checks only: smooth tile seams, the C and Python engines agreeing, and the
embedded preview. The flagship row's first item was to compare it with a second decoder, sensel by sensel.

## The second decoder

LibRaw's git master, commit `70513b5` (2026-11-17), which reports itself as `0.23.0-Snapshot202611`
(changelog: snapshot 202611, 2026-11-04). It is built here, not vendored (LibRaw is LGPL 2.1 / CDDL):

```
git clone --depth 1 https://github.com/LibRaw/LibRaw.git && make -C LibRaw -f Makefile.dist library   # 31 s
g++ -O2 -ILibRaw tools/libraw_dump.cpp LibRaw/lib/libraw.a -lz -lm -o libraw_dump
./libraw_dump P1000450.RW2 P1000450.u16 > P1000450.json
PYTHONPATH=src python3 tools/libraw_dump_check.py P1000450.RW2 P1000450.u16 P1000450.json --engines native,python
```

`tools/libraw_dump.cpp` (new) writes LibRaw's `raw_image` and the metadata the existing rawpy check compares;
`tools/libraw_dump_check.py` (new) runs the same comparison as `tools/rw2_libraw_check.py`: every sensel,
as-shot balance, black per CFA position, CFA, crop, and white level (reported).

## Result

The snapshot opens the file. Every sensel matches, on both our engines (row: `eval/panasonic-rw2-177mp-libraw-snapshot-2026-11-18.jsonl`):

| file | tiles | sensels | differing (C) | differing (Python) | WB R/G, B/G | black | CFA | crop | white |
|---|---|---|---|---|---|---|---|---|---|
| S1R II P1000450 (177 MP) | 4 x 2 | 176,909,376 | **0** (2.93 s) | **0** (108 s) | 1.8359, 2.1055 both | 512 both | RGGB both | (4, 4) 16288 x 10848 both | 16319 both |
| S1R II P1000454 (control) | 2 x 1 | 44,281,664 | 0 | - | 1.9531, 1.9727 both | 512 | RGGB | = | = |
| S5 II 96 MP (control) | 3 x 1 | 96,160,064 | 0 | - | 2.0547, 1.6641 both | 512 | RGGB | = | = |
| P1000454, one dump sensel flipped (negative control) | 2 x 1 | 44,281,664 | **1**, at (2716, 77) | - | | | | | exit 1 |

The two controls were already equal against LibRaw 0.22.2; they are equal against the snapshot too, so
its rewritten RawFormat 8 path did not change single-row files. The negative control shows the check sees
a single wrong sensel.

So the 177 MP decode is now confirmed by an independent decoder, not only by seams and the preview. The
earlier judgement that tile 0's low preview correlation (0.60) was the scene, not the decode, was right.

## Why LibRaw 0.22.2 refused it

Traced in the source (`git diff 0.22.2 70513b5 -- src/decoders/pana8.cpp libraw/libraw_internal.h`):
0.22.2 and 0.22.3 hold at most five *stripes*, and refuse any whose height is not the full sensor height,
so a second row of tiles cannot pass. The snapshot replaces stripes with a tile grid (tag 0x42 as columns,
0x43 as rows, up to 12 tiles), checks that every row of tiles spans the width and every column the height,
and decodes each tile at its own top.

It does not read the top from the file. Its `tile_left` is a `uint16_t`, so storing tag 0x45's 32-bit
value keeps only the low half (the left edge) and drops `top << 16`; the top is then summed from the
heights of the tiles above. Our reader reads both halves and refuses a tile whose stored top disagrees with
that sum (`C8Params`, `tests/test_rw2_c8.py`). On every real file the two agree, so the decoders give the
same sensels; on a file that broke the rule, LibRaw would place the tile by the heights and we would refuse.

## Not done

- Adobe DNG Converter on the same frame (needs a machine with it).
- rawpy still bundles 0.22.2; `tools/rw2_libraw_check.py` will read this file directly once a rawpy release
  ships a LibRaw with the tile grid.
- Colour still needs the S1R II's `.dcp`, as for every RW2.
