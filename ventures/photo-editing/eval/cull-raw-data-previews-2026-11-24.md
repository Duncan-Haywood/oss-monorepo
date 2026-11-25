# Cull page: previews developed from a DNG's sensor data (2026-11-24)

Before today `site/cull.html` showed nothing for a DNG with no JPEG inside: the
2026-11-23 check (`eval/cull-page-previews-2026-11-23.md`) listed
`dng/LG Nexus 5X.dng` as a miss. Phone DNGs are often like that. All 26 frames
drawn below from Google's HDR+ burst set (Nexus 5, 6, 6P, 5X, Pixel and Pixel
XL) carry no JPEG at all.

`site/rawmosaic.mjs` now reads the CFA image itself, uncompressed (any bit depth
DNG packs) or lossless JPEG (SOF3, predictors 1-7, restart markers), in strips
or tiles. Each 2 x 2 CFA block (6 x 6 on X-Trans) becomes one pixel: black and
white levels, LinearizationTable, ActiveArea and DefaultCrop with the CFA phase
counted from the active area, OpcodeList2 GainMaps (phone lens shading),
OpcodeList3 FixVignetteRadial, AsShotNeutral white balance with each channel
stopped at white (clipped blocks show white), the dcraw colour construction
from ColorMatrix (the D65 one when there are two), BaselineExposure plus at most
2 stops of lift to put the 99.5th-percentile luminance at 0.95, then sRGB. The
page runs it in up to two module workers (`site/rawmosaic-worker.mjs`) and
keeps a 0.92-quality JPEG of the result in memory. Nothing else changes: files
with an embedded JPEG still use it.

## Files

- 26 HDR+ bursts, frame `payload_N000.dng` of every sixth burst prefix in
  `gs://hdrplusdata/20171106_subset/bursts/` (CC BY-SA 4.0; served at
  storage.googleapis.com/hdrplusdata): 4 lossless-JPEG tiled (Pixel, Pixel XL,
  Nexus 6P), 22 uncompressed 16-bit strips.
- The 8 DNGs of drewnoakes/metadata-extractor-images `dng/` (sparse clone as in
  `eval/cull-page-previews-2026-11-23.md`): the Nexus 5X (no JPEG; 4 GainMaps),
  DJI Phantom 4 x2, Leica T, Leica X Vario and Pentax Q-S1 (these have JPEGs, so
  the page never develops them; they are here to test the reader and colour),
  and two 2 KB BigTIFF test files.

## Checks

    node eval/cull-raw-data-previews.mjs HDRP mei/dng OUT > report.tsv
    python3 eval/cull-raw-data-previews-check.py OUT       # numpy
    python3 eval/cull-raw-data-previews-colour.py OUT      # numpy, Pillow
    node eval/cull-raw-data-page.mjs DIR PAGEOUT           # Playwright

**Sensels** (`cull-raw-data-previews-sensels-2026-11-24.tsv`): the CFA values
read in JavaScript equal shootflow's own reader (`raw_develop.read_raw`, checked
against LibRaw in earlier runs) on **32 of 32 files, every sensel** (8.1 M to
16.2 M each). The BigTIFF pair is refused as before (magic 43).

**Colour** (`cull-raw-data-previews-colour-2026-11-24.tsv`): each preview against
shootflow's own half-size development of the same file (`develop`, tone curve
off, opcodes on), both shrunk to 256 px, exposure matched by one luminance
gain, CIELAB dE76 over pixels below 0.9 in both:

| reference | files | median of per-file median dE | worst file |
| --- | --- | --- | --- |
| shootflow, dcraw colour model (the page's construction) | 32 | 0.41 | 3.28 (Leica T) |
| shootflow, DNG colour model (what `shootflow develop` ships) | 32 | 0.68 | 3.27 (Leica T) |
| the camera's own JPEG, where there is one | 5 | 4.91 | 12.46 (DJI, its own look) |

The two worst against shootflow (Leica T 3.28, DJI 0.77 to 0.91 with a long p90
tail) carry WarpRectilinear, which shootflow runs and the page does not: pixels
are displaced, not miscoloured. With opcodes off in shootflow they are 0.61 and
0.33. Before GainMap was added the Nexus 5X was 6.60 dE (dark, tinted corners);
with it, 0.36. Before the clip and the CFA-phase fix, three of 32 came out
magenta (the DJI's sky, all of the Nexus 5X and the Leica T): the unit tests now
pin both.

**Time** (Node 22, this container, decode + develop): lossless-JPEG frames 0.95
to 1.16 s, uncompressed 0.32 to 0.74 s. In Chromium (Playwright, 2 workers) the
26 HDR+ frames, 529 MB, loaded in **10.8 s with 26 of 26 previews** and no page
errors; a mixed 13-file card (5 phone DNGs, 6 camera DNGs with JPEGs, the 2
BigTIFF stubs) in 3.1 s, the Nexus 5X opening upright in the large view as
"preview 2008x1504 (developed from the raw data)".

## Not done

- Lens-distortion warps, bad-pixel lists and the other opcodes (named in the
  notes, not run). No demosaic: one pixel per CFA block is half the sensor's
  width on Bayer, a sixth on X-Trans.
- LinearRaw DNGs with no JPEG (iPhone ProRAW and Samsung phone DNGs carry one, so
  none was needed here), lossy DNG, JPEG XL DNG (DNG 1.7), BigTIFF.
- Safari and Firefox (module workers exist in both since 2023, untested).
- A real phone shoot: the HDR+ frames are bursts' first frames, not a card.
