# Sony's in-file lens corrections, read and checked against lensfun (2026-11-15)

## Why

`portfolio/flagships.yaml` listed "Sony's in-file lens corrections (ARW 0x7032, 0x7035, 0x7037) against
lensfun on the A7 III/IV files" as buildable with public samples. Sony E-mount bodies store the lens's own
distortion, lateral-colour and vignetting curves in every ARW, the curves the camera applies to its JPEGs.
Until now ShootFlow corrected an ARW's lens only with a lensfun database (`--lens-db`), so an A7 user with no
database, or with a lens lensfun lacks, got the raw, uncorrected geometry.

## The format

Read from the raw image's IFD (the full-size sub-IFD) of three of the six real ARWs in
drewnoakes/metadata-extractor-images (ILCE-5000, ILCE-7M3, ILCE-7M4; the A500, NEX-5N and NEX-7 carry none),
signed 16-bit arrays:

| tag | name (ExifTool) | layout seen |
|---|---|---|
| 0x7032 | VignettingCorrParams | n, then n knots; 17 values; n = 11 (A5000) or 16 |
| 0x7035 | ChromaticAberrationCorrParams | 2n, then n red and n blue knots; 33 values |
| 0x7037 | DistortionCorrParams | n, then n knots; 17 values (A5000: 11 knots and five zeros) |
| 0x7038 | (A7 IV only) | 7032, 4688: the picture size the tables describe (the raw frame is 7168 x 5120) |

The knot spacing and fixed-point scales follow darktable's reader (`src/common/exif.cc`, `src/iop/lens.cc`,
GPL; read for the format, no code copied): knots evenly spaced from the centre to the corner; an output pixel
at radius r samples the raw frame at r (1 + d / 2^14); red and blue at that radius times 1 + c / 2^21; the
vignetting gain 2^(2^(v / 2^13 - 1) - 0.5). Those are the claims checked below.

## Check against lensfun

`PYTHONPATH=src python3 eval/sony_in_file_corrections.py LENSFUN/data/db ARW...` (lensfun master, the clone
used by `eval/sony-samsung-lens-2026-11-14.md`; output in `sony-in-file-corrections-2026-11-15.out.txt`).
Each frame's lens is lensfun's match for the file's own EXIF LensModel, at the EXIF focal length; all three
calibrations have the camera's crop and a 3:2 aspect, so the corner is at 1.803 in lensfun's units (1 = half
the short side). Pixel figures are for a frame 6000 px wide (half-diagonal 3606 px).

Distortion. Sony's tables include their own framing (knot 0 is not zero), so each comparison allows a free
zoom. "Decoded" fixes the scale at 2^-14 and the last knot at the corner:

| frame | lens, focal | Sony corner correction | decoded, knots on the corrected radius: max gap | same, knots on the raw radius: max gap | free fit (scale, last-knot radius) |
|---|---|---|---|---|---|
| A5000 | E PZ 16-50mm, 16 mm | 11.9% barrel, 411 px | 9.0 px | 60.1 px | 2^-13.50, 2.24 |
| A7 III | FE 24-105mm F4 G, 24 mm | 6.2% barrel, 222 px | 7.3 px | 14.8 px | 2^-14.15, 1.84 |
| A7 IV | FE 24-70mm F2.8 GM II, 42 mm | 2.3% pincushion, 84 px | 3.4 px | 8.2 px | 2^-14.50, 1.68 |

- With the decoded reading, Sony's curve and lensfun's independent calibration agree to within 9 px on
  corrections of 84 to 411 px, about 2-4% of the correction. Two calibrations of different copies of a lens
  differ by about this much: on a Leica X Vario lensfun and the maker's own DNG warp differ by up to 8 px
  (`eval/lensfun-correction-2026-11-13.md`).
- Reading the knots as raw-frame (source) radii instead fits worse on every frame, and much worse on the
  strongly distorted A5000 (60 px against 9), so the knots are on the corrected radius.
- The free fit recovers the scale and the corner on the A7 III (2^-14.15 and 1.84 against 2^-14 and 1.80). On
  the A5000 and A7 IV the fit is loose (a scale-radius trade-off: different pairs fit about equally well), so it
  neither confirms nor contradicts the decoded values there; the fixed-value gaps above are the check that
  holds for all three.

Lateral colour (red minus blue at the corner, 6000 px frame): A5000 Sony 3.96 px, lensfun 4.32 px; A7 IV
1.76 px against 1.36 px; A7 III -4.62 px against +0.38 px. Two of three agree in sign and size; the A7 III's
disagrees: Sony's table says its blue spreads outward by 9 per 10,000 at the corner, lensfun's calibration
says about 1. Without a frame with sharp corner edges there is no way to say which is right.

Vignetting: Sony's decoded gain at the corner is 0.60 stops (A5000, f/8), 1.03 stops (A7 III, f/4) and
0.77 stops (A7 IV, f/2.8, no lensfun calibration at that aperture), where lensfun's `pa` calibration lifts the
first two by 2.60 and 2.56 stops. Either Sony's table is a partial correction by design (the camera's
"shading compensation" is known to leave some falloff) or the gain formula is not right. The table is read
but **not applied** until an evenly lit frame says which.

## What changed

- `src/shootflow/sony_corrections.py`: reads the three tables; the decoded curves; a degree-7 polynomial fit
  of the distortion (times each colour's lateral factor) as a DNG WarpRectilinear2 with radius 1 at the
  frame's corner, rescaled when the raw frame is larger than the picture the tables describe (0x7038, else
  the DefaultCrop): the A7 IV's knots end at the corner of 7032 x 4688, not of its 7168 x 5120 frame. The fit
  follows Sony's piecewise-linear table to 0.16-0.91 px.
- `arw.parse_arw` keeps the tables on the raw IFD it builds; `raw_develop.develop` applies them as a lens
  warp when the file is an ARW with a distortion table and no lens-database correction ran (a lensfun match
  still wins), with lateral colour unless `--no-lens-tca`, and the fill zoom unless `--no-lens-fill`.
  `--no-in-file-lens` switches it off. The report's lens reads "Sony in-file corrections" with a note.
- On the three real frames: the A5000 develops with zoom 0.950 to fill the frame and fit 0.84 px, the A7 III
  0.972 and 0.23 px, the A7 IV 1.024 and 0.27 px. By eye the A5000's fence rail, bowed by 16 mm barrel, is
  visibly straighter (an automatic edge measure on that frame was too noisy to report).
- `tests/test_sony_corrections.py` (6 tests): the real knot arrays, padding and malformed counts, the decoded
  values, the warp fit, planes and picture rescale, and a synthetic ARW through develop with the stage on and
  off (off is byte-identical to a file without tables).

## Not done

Vignetting (above). Lateral colour on the A7 III disagrees with lensfun. The tables are read on the raw
frame's centre; the A7 IV's DefaultCrop is centred within one pixel, others not checked. Only E-mount bodies
from these three were seen; older bodies (NEX-5N, NEX-7, A500) write no tables. The polynomial warp's
0.9 px worst case on the 11-knot A5000 table comes from the table's kinks; a piecewise warp would follow it
exactly but has no DNG opcode.
