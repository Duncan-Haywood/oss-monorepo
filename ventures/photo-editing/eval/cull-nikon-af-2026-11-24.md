# Cull page: Nikon AF points placed (2026-11-24)

Flagship item (portfolio/flagships.yaml photo-editing; NEXT.md "From the cull page's AF point": "Nikon
phase-detect AF points: map point numbers to positions per body"). Until today the cull page drew the
camera's AF point for Canon, Sony, Fujifilm, Panasonic and Olympus, and for Nikon only a live-view area.
Nikon is the second-largest raw format on most cards, so every Nikon frame fell back to "the busiest of 16
cells", the score that lets a sharp background beat a soft subject.

## What Nikon records, and where the positions come from

Nikon's AFInfo2 (maker note tag 0xb7) names the points it used by number and by bit on a per-schema grid;
it writes no coordinates except in live view and on the Z bodies when a subject is locked. Byte layouts
follow ExifTool's `Nikon.pm` tables (`AFInfo2V0100`, `V0101`, `V0300`, `V0400`):

| AFInfo2 | Bodies | What the page reads |
| --- | --- | --- |
| 0100 | D3, D4, D300, D600, D700, D750, D7000-D7200, D800/D810, Df, D5200-D5600 | byte 6 schema (1 = 51-point, 3 = 39-point), 7 PrimaryAFPoint, 8.. AFPointsUsed |
| 0101 | D5, D500, D850, D7500 | 6 schema (1, 7 = 153-point), 0x30.. AFPointsInFocus, then 8.. AFPointsUsed, 0x44 PrimaryAFPoint |
| 0300 | D6, D780, Z5-Z7, Z50, Zfc | byte 7 = 1: AF area centre and size in AF-image pixels at 0x2a..; else AFPointsUsed at 0x0a on the 51, 81 or 105-point grid |
| 04xx | Z8, Z9, Z6III, Zf, Z5II, Z50II | byte 7 = 1: AF area at 0x3e..; auto-area (byte 5 = 197 or 207): AFPointsUsed at 0x0a on the 405, 299 or 231-point grid |

Point names to grid positions: the Focus-Points Lightroom plugin (github.com/FocusPointsLrC/Focus-Points,
Apache-2.0) ships a measured map per body (`focus_points/nikon/<model>.txt`, pixel centres and sizes in the
full frame, each contributed by a named user), plus which bodies share a map (D810 uses the D800's).
`tools/nikon_af_grids.py` converts those to fractions of the frame and writes `site/nikon-af-grids.mjs`
(135 KB: 29 measured maps covering 43 camera models with the shared ones) with ExifTool's number-to-name tables. Attribution and the changes made:
`THIRD_PARTY_NOTICES.md`. The plugin lists only the 55 selectable points of the 153-point D5/D500/D850;
the other 98 are placed by linear interpolation between neighbours and flagged.

Not placed: the 11-point bodies (D90, D3000-D3500, D5000, D5100) and bodies before 2007 (AFInfo 0x88),
which have no measured map; those files keep the busiest-cell score, as before. DX crops on FX bodies
move the points by CropHiSpeed (0x1b).

## Check 1: the public samples (metadata-extractor-images, 11 NEFs)

```
file                 model         read                              points
Nikon 800E.nef       NIKON D800E   AFInfo2 51-point C6               (0.500, 0.500)
Nikon D300.nef       NIKON D300    AFInfo2 51-point C6               (0.500, 0.500)
Nikon D810.nef       NIKON D810    AFInfo2 51-point C5               (0.446, 0.500)
Nikon D5100.nef      NIKON D5100   11-point: not placed (no map)
Nikon D90.nef        NIKON D90     11-point: not placed
Nikon D70, D70s x4, D200           AFInfo 0x88: not placed
```

The D810's bytes (`30 31 30 30 00 0d 01 0b 00 04 ...`) read PrimaryAFPoint 11 and AFPointsUsed bit 10,
both point 11 = C5 in ExifTool's table: the two fields agree. C5 is one column left of centre. Detail rank
at the point (`eval/cull-af-point-detail.py`): D810 0.945 (mirrored control 0.807), D800E 0.935, D300
0.641. Rows: `cull-nikon-af-mei-detail-2026-11-24.tsv`.

## Check 2: 28 Nikon Z8 raws (aaron-rust/hdr-sample-images, CC0)

A photographer's set: landscapes, a fishing rig, buildings, shot for HDR development. Before today the page
placed a point on 5 of 28 (those whose AF area the camera wrote as coordinates). Now **27 of 28**: the other
22 are auto-area frames, whose used points are a bit mask over the Z8's 405-point grid (8 to 49 points per
frame); one frame records none.

Does the point sit on the subject? Same rank test as the earlier AF work: Laplacian variance in a window
at the point (the centroid of the in-focus points) ranked among the same window slid over the frame, with
the point turned through the centre as the control a wrong grid (a flipped axis, a swapped row and column,
another body's map) would look like.

These files were shot in HLG tone mode, and their 320 x 212 and 1620 x 1080 previews are HEVC bitstreams,
not JPEG, so the page shows (and ranked on) the 160 x 120 IFD0 thumbnail. For the check,
`eval/nikon-hevc-previews.py` decodes the 1620 x 1080 HEVC preview with ffmpeg:

| preview | files | median rank at the point | top quarter | beats the turned control (off-centre points) |
| --- | --- | --- | --- | --- |
| 1620 x 1080 (HEVC, decoded here) | 27 | **0.924** | 22 of 27 | **19 of 23** (sign test p = 0.0013) |
| of which grid-placed (405-point mask) | 22 | 0.924 | 18 of 22 | 15 of 18 |
| of which camera-written coordinates | 5 | 0.932 | 4 of 5 | 4 of 5 |
| 160 x 120 (what the page has) | 27 | 0.732 | 11 of 27 | 17 of 23 |

The grid-placed points rank as high as the camera's own coordinates. Low ranks are open targets the camera
did lock on (IMAGE_001: a 48-point cluster across a building front; IMAGE_006: a lake surface). In the page
(Chromium, Playwright, no console errors), IMAGE_019's 16 in-focus points sit on the fishing reel.

**Independent geometry check.** ExifTool's own notes give the Z8/Z9 point spacing it measured, 260 px
horizontally and 292 px vertically in an 8256-wide frame (`FocusPositionHorizontal` / `Vertical`
divisors). The plugin's Z 9 map, measured by someone else, spaces its 27 x 15 grid 255 x 288 px: within
2% and 1.4%.

## What changed

- `site/rawpreview.mjs`: `nikonPhaseAf` (exported), `nikonCrop`; Nikon files get `meta.af` with every grid
  point (the used ones `inFocus`, so the page draws the coverage faintly) and `names`.
- `site/nikon-af-grids.mjs` (generated), `tools/nikon_af_grids.py`, `THIRD_PARTY_NOTICES.md`.
- `site/cull.html`: the status line names the points ("AF point: Nikon AFInfo2 51-point (C5)", or "16
  points around H16"); help, FAQ and structured data say which Nikon bodies are placed.
- `site/nikon-af.test.mjs`: 6 tests (the D810's bytes, 39-point numbering, 153-point in-focus bits and
  interpolation, Z coordinates, unknown body and 11-point give none, DX crop).
- `eval/cull-af-point-detail.py`: the turned-through-centre control for Nikon, box from in-focus points.
- `eval/nikon-hevc-previews.py`: HEVC preview decode for the check only.

The sparse reader returns the same `meta.af` as a whole read on all 11 sample NEFs and all 28 Z8 files.

## Open

- HLG-mode Z8/Z9 NEFs: the previews are HEVC, so the page shows a 160 x 120 thumbnail and reads the whole
  51 MB file looking for a JPEG (same on main before this change: 1,266.7 of 1,266.7 MiB read for 28
  files). Next: decode the 1620 x 1080 HEVC preview with WebCodecs `VideoDecoder` where the browser has an
  HEVC decoder (Safari; Chrome and Edge with hardware support), and stop the whole-file read once a
  HEVC preview is found.
- 11-point bodies (D90, D3x00, D5000, D5100) and pre-2007 bodies: no measured map. A map from frames shot
  with a known point, or Nikon's viewfinder diagrams measured, would close it.
- A card from a 0101 body (D5, D500, D850) to check the in-focus-first rule and the 98 interpolated points
  on real frames; the D780's two schemas; a DX-crop frame from an FX body.

## Reproduce

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
(cd mei && git sparse-checkout set nef)
git clone --depth 1 https://github.com/FocusPointsLrC/Focus-Points.git fp
curl -sSLo Nikon.pm https://raw.githubusercontent.com/exiftool/exiftool/master/lib/Image/ExifTool/Nikon.pm
python3 tools/nikon_af_grids.py fp Nikon.pm > site/nikon-af-grids.mjs        # byte-identical to the committed file
for i in $(seq -w 1 28); do curl -sSLo z8/IMAGE_0$i.NEF \
  "https://media.githubusercontent.com/media/aaron-rust/hdr-sample-images/main/image_gallery_hdr_sdr_raw_png_avif_jpeg/00_RAW/NIKON-Z8_BAYER-MATRIX_14BIT_LOSSLESS/IMAGE_0$i.NEF"; done
node eval/cull-af-point.mjs mei/nef OUT1 > OUT1/af.jsonl && python3 eval/cull-af-point-detail.py OUT1/af.jsonl
node eval/cull-af-point.mjs z8 OUT2 > OUT2/af.jsonl && python3 eval/cull-af-point-detail.py OUT2/af.jsonl
python3 eval/nikon-hevc-previews.py OUT2/af.jsonl z8 OUT2/hevc > OUT2/af-hevc.jsonl   # needs ffmpeg
python3 eval/cull-af-point-detail.py OUT2/af-hevc.jsonl                              # numpy, Pillow
node --test site/nikon-af.test.mjs
```

Reads per file: `cull-nikon-af-reads-2026-11-24.jsonl`; detail rows: `cull-nikon-af-z8-detail-hevc-*.tsv`,
`cull-nikon-af-z8-detail-thumb-*.tsv`, `cull-nikon-af-mei-detail-*.tsv`.
