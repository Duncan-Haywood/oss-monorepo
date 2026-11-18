# Camera-written DNGs against LibRaw, and the phone's lens shading map (2026-11-12)

## Why

Until today every DNG ShootFlow had developed against LibRaw was one ShootFlow's own tools
wrote (`tools/libraw_differential.py`), or a CR2 read into the same tags. The flagship's
`next:` listed "the four camera-written DNGs (DJI, Nexus 5X, Leica T, Pentax QS1; uncompressed,
develop as RGGB, not yet compared with LibRaw)". Three of them were reachable on
raw.githubusercontent.com from the public metadata-extractor-images collection (its README:
"You are free to use these media files however you wish"); the DJI file's name was not found
(directory listings answer 403 from the build container). They are downloaded at check time
and not committed.

| file | written by | sensor | bits | ActiveArea | opcode lists |
| --- | --- | --- | --- | --- | --- |
| `dng/LG Nexus 5X.dng` | Android camera API (DngCreator) | 4080 x 3028 | 10 in 16 | 2, 48, 3026, 4080 | OpcodeList2: 4 x GainMap |
| `dng/Leica T (Typ 701).dng` | camera | 4944 x 3278 | 12 | none (whole image) | OpcodeList3: WarpRectilinear (required) |
| `dng/Pentax QS1.dng` | camera | 4064 x 3000 | 12 | 0, 0, 3000, 4000 | none |

## Reading the file matches LibRaw

`tools/dng_camera_check.py` (new): both developers read the same file. ShootFlow develops half
size with the file's own colour tags, with BaselineExposure, profile tables and tone curve off
(LibRaw applies none of them) and opcode lists off (rawpy's LibRaw does not run them). LibRaw
renders with the camera white balance, no auto-brightening, the file's white level
(black-subtracted, `eval/cr2-brightness-gap-2026-11-12.md`) and the sRGB curve.

| file | CFA | black / white (ours, LibRaw) | median, 8-bit steps, `--colour dcraw` | p99 | `--colour dng` median | linear ratio (dcraw) |
| --- | --- | --- | --- | --- | --- | --- |
| Nexus 5X | RGGB | 52.07 / 1023; 51-52 / 1023 | **0.105** | 1.20 | 0.44 | 1.000, 0.996, 0.998 |
| Leica T | RGGB | 0 / 4095; 0 / 4095 | **0.027** | 0.14 | 0.70 | 1.000, 1.000, 1.000 |
| Pentax Q-S1 | RGGB | 0 / 4062; 0 / 4062 | **0.023** | 0.16 | 0.086 | 1.000, 1.000, 1.000 |

White balance agrees to four places on all three (LibRaw scales the Nexus's to green 0.992; the
ratios are the same). The Nexus's slightly larger gap is its fractional black (52.07, 52.05,
51.85, 52.21 per position), which LibRaw rounds to whole numbers on a 10-bit scale. The
`--colour dng` column is the DNG colour model against dcraw's, as on the CR2s: the Leica, at a
warm as-shot white, differs most.

The first run of the check also showed why it must turn BaselineExposure off: the Pentax tags
-0.5 EV, and ShootFlow's render (which applies it, as Adobe's do) is 2^-0.5 = 0.7075 of
LibRaw's in every channel, measured 0.7074-0.7075.

## The phone's lens shading map

A phone lens darkens and tints the corners. Android does not correct the raw data; it writes
the shading it measured into `OpcodeList2` as four `GainMap` opcodes, one per Bayer position
(row and column pitch 2), each a 13 x 17 grid of gains. On this Nexus 5X frame the gains are
1.00-1.02 at the centre and 2.6-3.8 in the corners, and they differ by colour: red needs 3.27-3.76
in the corners, the two greens 2.78-3.21, blue 2.61-2.94. A reader that ignores them shows corners
at a third of their brightness with a colour cast. ShootFlow did, and so does LibRaw as rawpy
packages it.

`shootflow.dng_opcodes` (new) reads all three opcode lists, runs `GainMap` in `OpcodeList2`
(the specification's rectangle, plane and pitch; map points at `origin + i * spacing` in
relative coordinates of the active area; gain bilinear between the four nearest points, rows
first, clamped at the map's edges; the value capped at 1), and names every other opcode in the
report, marking those the file says are required. It is on by default; `--no-opcodes` and
`DevelopSettings(opcodes=False)` turn it off. The numpy engine repeats the same arithmetic and
gives the same bytes.

On the Nexus frame, corner luminance over the centre tile (1/8 of each side), linear light:

| render | top left | top right | bottom left | bottom right |
| --- | --- | --- | --- | --- |
| LibRaw | 0.209 | 0.073 | 0.393 | 0.192 |
| ShootFlow, GainMap off | 0.198 | 0.070 | 0.395 | 0.195 |
| ShootFlow, GainMap on | 0.578 | 0.176 | 1.125 | 0.455 |

These ratios depend on the scene (the top right is a dark background), so they show the size
of the correction, not its accuracy. Side by side:
`docs/reports/img/photo-editing-2026-11-12-gainmap.jpg`. The file holds no camera-rendered
preview (its only IFD is the raw), so there was no phone render to compare against.

What makes the arithmetic right is checked on synthetic files (`tests/test_dng_opcodes.py`, 11
tests): per-position gains give a darkened scene back within the darkened sensels' rounding
(3 8-bit steps at most, on the darkest patch), and with the gains off it is more than 40 steps
out; a map rising linearly across the frame gives a flat field back at every column, which
checks the coordinate convention against a closed form (bilinear interpolation of a linear
function is exact); the rectangle and pitch limit the sensels touched; a gain cannot push a
value past white; other opcodes are named and change nothing; a truncated list is noted and
skipped; `shootflow develop` and `--no-opcodes`; numpy and pure Python byte-identical with
random gains, odd sizes, an offset origin and clipping.

Not compared: Adobe's own GainMap output (no Adobe render of this frame; the DNG SDK computes
in float32, ShootFlow in float64). This frame's map has spacing 1/13 for 13 points (and 1/17
for 17), so its last point sits at 12/13 of the height rather than at the edge; the
specification's formula is followed as written, which clamps the last 1/13 to the edge row of
gains. Newer Android versions write 1/(points - 1).

## Engine fix found on the way

With clipped sensels and an odd image height, half size reported a different clipped fraction
on the two engines: the pure-Python path never normalised the unbinned last row, while numpy
counts every row. It now counts that row too. Pixels were already identical.

## Not done

- WarpRectilinear (the Leica's lens distortion correction in OpcodeList3) and the other opcodes
  are named, not run.
- The DJI Phantom 4 DNG: file name not found without a directory listing.
- A phone DNG with its rendered JPEG alongside, to compare the corrected corners with the
  phone's own render.

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy pillow
    curl -LO "https://raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/dng/LG%20Nexus%205X.dng"
    PYTHONPATH=src:tests /tmp/v/bin/python tools/dng_camera_check.py "LG Nexus 5X.dng" --colour dcraw --preview
