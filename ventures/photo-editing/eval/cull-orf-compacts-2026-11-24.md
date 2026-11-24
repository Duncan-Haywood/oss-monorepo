# Cull page: BigTIFF DNGs and the Olympus compacts' ORFs (2026-11-24)

The cull page's README listed two gaps: BigTIFF DNGs (magic 43) gave no preview,
and four Olympus compacts in the public samples (C-5050 Zoom, C-8080, SP-350,
SP-500 UZ) showed only a 160 x 120 thumbnail. The README called their missing
picture "640 px previews". That was wrong. A JPEG-marker scan of all four
files finds exactly one JPEG each, the 160 x 120 thumbnail, so no larger
preview exists to find. A bigger picture has to be developed from the sensor
data, the way the page already does for phone DNGs that hold no JPEG.

## What changed

- `site/rawpreview.mjs` reads BigTIFF: the 16-byte header, 8-byte entry
  counts, 20-byte entries with values inline up to 8 bytes, 8-byte next
  pointers and the LONG8/IFD8 types. A header whose offset size is not 8 is
  refused.
- `site/rawmosaic.mjs` reads BigTIFF DNG mosaics through the same paths, and
  reads the compacts' "IIRS" ORF layout: 12-bit MSB-first sensels, even rows
  first, odd rows from the next 2048-byte boundary, plus the extra row past
  the TIFF's strips when the TIFF height is odd. White balance comes from the
  "OLYMP\0" maker note's RedBalance/BlueBalance (0x1017/0x1018), the CFA phase
  from EXIF CFAPattern, black 0 and white 4095. These are the same rules as
  `src/shootflow/orf.py`, which matches LibRaw sensel for sensel
  (eval/olympus-orf-reader-2026-11-14.md).
- `site/cull.html` develops a preview when the file has none *or only one
  under 640 px*, for DNG and ORF. If that fails, the small thumbnail is kept.

## Sensels

`node eval/cull-orf-compacts.mjs OUT FILE...` hashes the page's sensels. On
all four files the SHA-256 equals the hash of `shootflow.orf.parse_orf`'s
values:

| file | sensor | sensels SHA-256 (first 16) | page preview | develop ms (Node) |
|---|---|---|---|---|
| C-5050 Zoom | 2576 x 1926 | aafe976be5ba9bd9 | 1288 x 963 | 169-220 |
| C-8080 | 3280 x 2454 | 73d398fdc563eb83 | 1640 x 1227 | 270-330 |
| SP-350 | 3280 x 2454 | df6155e2f55890fc | 1640 x 1227 | 263-361 |
| SP-500 UZ | 2832 x 2118 | eb4d16ba97a37540 | 1416 x 1059 | 219-274 |

The white balance read (R/G 1.3672, 2.1602, 1.6641, 2.0586; B/G 1.6094,
1.7227, 1.7852, 1.4844) equals LibRaw's camera multipliers in the 2026-11-14
table.

## Colour: the files carry no matrix

A DNG states its colour matrix. These ORFs don't, and the page can't ship
Adobe's per-camera tables. Three ways to choose a matrix were tried. Each was
scored against LibRaw 0.22.2's own half-size development of the same file
(rawpy 0.28.0: camera white balance, LibRaw's built-in matrix for the body,
linear sRGB, no auto-brightening). LibRaw is an independent reader with an
independent matrix, and the page uses neither. The scorer
(`eval/cull-orf-compacts-check.py`) puts both images on one exposure (the
page's lift divided out, then one scale on the median luminance), then takes
the CIEDE2000 per pixel at the page's size, on pixels between 2% and 90%
luminance that neither image clips.

- **plain**: no matrix, camera RGB after white balance. This is what the page
  shows a DNG with no ColorMatrix.
- **free**: a 3 x 3 least-squares fit from the white-balanced camera image to
  the camera's own 160 px JPEG, decoded to linear, with rows scaled to sum to
  1. Guarded against implausible fits.
- **constrained**: the same, but each pixel is divided by its own sum, so the
  JPEG's tone curve and exposure drop out. Rows sum to 1, 6 parameters,
  midtone pixels only.
- **generic**: one fixed matrix, the mean of the sRGB-from-camera matrices
  that five other cameras wrote into their own DNGs in the public samples (DJI
  Phantom 4, LG Nexus 5X, Leica T, Leica X Vario, Pentax Q-S1). Rows sum to 1.

Median and 90th-percentile CIEDE2000 against LibRaw. "Chroma" is the
page's median chroma over LibRaw's: under 1 means duller, over 1 more
saturated.

| file | plain | free | constrained | generic | chroma plain / generic |
|---|---|---|---|---|---|
| C-5050 Zoom | 2.06 (p90 3.65) | 2.06 (fit refused as implausible: plain) | 2.88 (7.20) | **1.14** (2.10) | 0.61 / 1.17 |
| C-8080 | 4.37 (5.53) | **1.36** (2.21) | 3.02 (4.10) | 2.91 (4.40) | 0.66 / 1.29 |
| SP-350 | 3.28 (4.41) | 3.44 (6.20) | 2.83 (4.92) | 3.22 (4.18) | 0.73 / 1.23 |
| SP-500 UZ | 3.85 (5.90) | 1.65 (3.38) | 3.58 (6.68) | **1.00** (2.82) | 0.53 / 1.06 |
| mean of medians | 3.39 | 2.13 | 3.08 | **2.07** | |

The rule used: ship the variant with the lowest mean median that makes no
file more than 0.5 worse than plain. **generic** passes it. It is better than
plain on all four files, at the median and at p90. **free** comes close
(2.13) but makes the SP-350 worse (p90 4.41 to 6.20), and its fitted SP-350
matrix (red taking +1.02 from green) is not a plausible camera matrix.
**constrained** over-saturates (chroma 1.2 to 1.4), because the JPEG's tone
curve still leaks in, and it makes the C-5050 Zoom worse by 0.82. So the
page uses generic for any ORF it develops. A DNG with no ColorMatrix is
malformed and still shows plain camera colours. The fit is kept opt-in
(`developMosaic(bytes, { reference, fitMode: "free" | "constrained" })`) so
these rows can be reproduced.

Caveats. There are four files, and the rule was written after the free and
constrained rows had been seen (generic was added third). Generic leaves the
C-8080 and SP-350 about 0.3 more saturated than LibRaw and still about 3
ΔE00 away, so it is a culling preview's colour, not a profile. LibRaw's
matrices are Adobe's, and Adobe is itself an estimate.

## In the page

Chromium (Playwright, `node eval/cull-raw-data-page.mjs DIR OUT`) on the four
compacts, the E-M10 ORF, the Pentax Q-S1 DNG and both BigTIFF files: 8 of 8
read in 1.6 s with no page errors. The compacts get 1288 x 963 to 1640 x
1227 previews, upright (the C-5050 Zoom's portrait frame too). The E-M10 and
Pentax keep their embedded 3200 and 4000 px JPEGs. Both BigTIFF files show
their 64 x 48 embedded preview, found through the SubIFD (the CFA in these
2 KB test files is not a real lossless JPEG, so developing fails, and the page
falls back to that preview as designed).

## Reproduce

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
(cd mei && git sparse-checkout set orf dng)
F=(mei/orf/"Olympus C5050Z.orf" mei/orf/"Olympus C8080.orf" mei/orf/"Olympus SP350.orf" mei/orf/"Olympus SP500UZ.orf")
node eval/cull-orf-compacts.mjs OUT "${F[@]}" > /dev/null             # writes the thumbnails
python eval/cull-orf-compacts-check.py thumbs OUT                      # Pillow
for m in free constrained generic; do
  FIT_MODE=$m node eval/cull-orf-compacts.mjs OUT "${F[@]}" > OUT/rows.jsonl
  python eval/cull-orf-compacts-check.py score OUT "${F[@]}"           # rawpy, numpy, Pillow
done
node --test site/bigtiff-orf.test.mjs
```

Under `FIT_MODE=free` or `constrained`, the `plain` rows are the no-matrix
development. Under `generic`, both rows are generic.
