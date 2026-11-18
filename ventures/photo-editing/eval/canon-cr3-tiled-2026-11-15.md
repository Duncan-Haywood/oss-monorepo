# Canon CR3 in several tiles, checked against LibRaw (2026-11-15)

## Why

Canon's CRX codec can store each colour plane cut into a grid of tiles (CMP1's tile width and height,
with two "several tiles" flags in byte 27). The widest sensors (the R5 class) may use it. `cr3.py` refused
every tiled file, naming Adobe's DNG Converter. This run reads full-quality (lossless) tiled CR3s.

## No tiled file to test with, so make one LibRaw will judge

raw.pixls.us still answers `CONNECT tunnel failed, response 403` from this container (checked today), and
the five CR3s in drewnoakes/metadata-extractor-images are all one tile. A tiled file written by our own
encoder and read by our own decoder proves nothing about the layout: the two share any misreading. LibRaw
refuses a fully synthetic CR3 container (`Unsupported file format`, tried first), so
`tools/cr3_tiled_libraw_check.py` starts from a real file:

1. decode a real one-tile full-quality EOS R8 CR3 with `shootflow.cr3` and check every sensel against
   LibRaw 0.22 (rawpy 0.25) `raw_image` (the baseline);
2. re-encode those sensels as a tiled sample with the lossless CRX encoder in `tests/test_cr3.py`;
3. append it inside the file's final `mdat`, patch the raw track's `co64` and `stsz`, CMP1's tile size,
   several-tiles flags and header size;
4. decode the copy with LibRaw and with `shootflow.cr3` (C and Python engines).

## The layout (as LibRaw's `crx.cpp` reads it; an independent implementation)

- Plane tile size = CMP1 tile size / 2. Columns = ceil(plane width / tile width); every tile but the last in a
  row is the tile width and the last takes the rest; rows likewise. Tiles under 22 plane sensels (or a
  remainder under 22), odd tile sizes, a tile larger than the sensor, or more than 255 a side are refused.
- The sample header: per tile, row by row, `FF01 0008 <tile bytes:4> <index:2> 0000`, then per plane
  `FF02 0008 <plane bytes:4> <flags:4>` (plane number in the top four bits; LibRaw checks it) and one
  `FF03` subband header. The data follows in the same order; the next tile starts at the previous tile's
  start plus its byte count.
- Each tile's plane is an independent band (Rice and run state start afresh) at the tile's width and height,
  written into the frame at (2 x tile row + plane row, 2 x tile column + plane column).

## Result

Rows in `canon-cr3-tiled-libraw-2026-11-15.jsonl`. Two real EOS R8 files (6188 x 4120, 25.5 M sensels each):

| file | tile (sensor) | grid | plane tiles (w x h) | LibRaw differing | ours C / Python differing | ours C / Python s |
|---|---|---|---|---|---|---|
| (both) | one tile, as shot | 1 x 1 | 3094 x 2060 | 0 (baseline) | - | - |
| `IMG_0036.CR3` | 3096 x 4120 | 2 x 1 | 1548, 1546 x 2060 | 0 | 0 / 0 | 0.53 / 33.4 |
| `IMG_0036.CR3` | 2048 x 2000 | 4 x 3 | 1024 (last 22) x 1000 (last 60) | 0 | 0 / 0 | 0.56 / 33.9 |
| `IMG_0036.CR3` | 4096 x 4120 | 2 x 1 | 2048, 1046 x 2060 | 0 | 0 / 0 | 0.61 / 35.4 |
| `_MG_0039.CR3` | 3096 x 4120 | 2 x 1 | 1548, 1546 x 2060 | 0 | 0 / 0 | 0.50 / 35.0 |
| `_MG_0039.CR3` | 2048 x 2000 | 4 x 3 | 1024 (last 22) x 1000 (last 60) | 0 | 0 / 0 | 0.46 / 34.3 |
| `_MG_0039.CR3` | 4096 x 4120 | 2 x 1 | 2048, 1046 x 2060 | 0 | 0 / 0 | 0.49 / 35.1 |

Every one of 25.5 M sensels equal on all six tiled files, on LibRaw and on both of our engines. The 4 x 3
grid's last column is 22 plane sensels wide, the smallest edge tile LibRaw accepts. Speed is that of a
one-tile file (0.5 s with the C decoder, which writes each tile straight into its place).

Control (`--control`: the right tiles written column by column, so headers and data are in the wrong
order): on `IMG_0036.CR3` with the 4 x 3 grid, LibRaw decodes the file and
returns 21,364,320 of 25,494,560 sensels wrong; `shootflow.cr3` refuses it ("the compressed band is
invalid": a band coded at one tile's width read at another's runs out). So the check can fail, and a wrong
layout does not pass silently on either reader.

## Tests

`tests/test_cr3.py` `TiledTests` (5 tests): five grids (2 x 2 uneven, 2 across, 2 down, 2 x 2 even, 3
across with a 22-sensel last tile) on both engines; the grid against LibRaw's layout rule; a tile byte count
larger than its planes; a tiled frame through `rd.parse_raw`; refusals (wrong tile index, wrong plane
number, an edge tile under 22, a tile under 22, flags that disagree with the tile size). The C-RAW refusal
tests now use a tiled C-RAW header. The tiled tests use a sensor with detail in every tile (the older test
sensor is flat right of its crop, and a flat tile codes to 35 bytes).

Hand mutations of `cr3.py`, each run against `test_cr3`: tile column placement (`t.col` for `2 * t.col`),
tile row placement, the last tile's height, the tile-index check, the next tile's start (ignoring the tile
byte count) and the first tile's start: all six fail 1-13 tests. One survives: stepping planes by the
subband's byte count instead of the plane's, which are equal in every file here, the real ones included.
Found on the way: a 7-byte zero pad before a band decoded to the same sensels, because these bands open
with a long run of zero bits (the escape code), so the byte-count test pads with 0xA5 instead.

## Not done

- **A real tiled CR3.** The layout comes from this repository's reading of LibRaw; a Canon file LibRaw also
  misreads would pass this check. A real R5-class file is still wanted.
- **C-RAW in tiles**: refused. Where tiles meet, the wavelet takes extra edge coefficients (LibRaw's
  `exCoefNumTbl`) and the lifting changes at the seams. A tiled C-RAW could be made the same way (the C-RAW
  test encoder would need the tile edges) and checked against LibRaw.

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set cr3)
    PYTHONPATH=src:tests /tmp/v/bin/python tools/cr3_tiled_libraw_check.py mei/cr3/IMG_0036.CR3 mei/cr3/_MG_0039.CR3 \
        --tiles 3096x4120,2048x2000,4096x4120 --engines c,python
    PYTHONPATH=src:tests /tmp/v/bin/python tools/cr3_tiled_libraw_check.py mei/cr3/IMG_0036.CR3 --tiles 2048x2000 --control
