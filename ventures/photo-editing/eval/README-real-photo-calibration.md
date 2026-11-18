# Real-photo calibration, 2026-11-08

`tools/real_photo_calibration.py` degrades real photographs by known amounts and
reads the analyser back. Photos: OpenCV's `building.jpg` (868x600) and
`butterfly.jpg` (493x356), Apache-2.0, fetched at run time, not stored here.
Raw output: `real-photo-calibration-2026-11-08.md` (grain is seeded; the run is repeatable).
Two photos, so a first look, not a calibration.

| signal | injected | result on real photos | verdict |
|---|---|---|---|
| sharpness | Gaussian blur 0 to 8 px | falls monotonically on both (butterfly 0.98, 0.93, 0.72, 0.26, 0.04) | works |
| grain vs sharpness | noise sigma 0 to 32 | sharpness stays 0.97+ on both (grain not mistaken for detail) | works |
| noise_sigma | noise sigma 0 to 32 | rises monotonically; reads 12.9 for 32 on the butterfly, 8.7 on the building (JPEG q95 and the median read under-count) | monotone, under-reads |
| exposure | brightness x0.3 to x2.5 | peaks at the original, falls both ways; brightening clips highlights, so x1.6 scores below x0.6 | works |
| tilt | rotation 0 to 8 degrees | **fixed 2026-11-08, see below.** Before: confidence 0.04 to 0.10; building read -3, -2, -2, -5, 0 for 0, 1, 2, 4, 8 | was failing on natural scenes |

The tilt estimate needs long straight axis-aligned edges. A butterfly has none
and a building has perspective lines at many angles, so the peak bin jumps. The
story penalty is already multiplied by confidence, so at 0.1 or less it costs a
frame under 0.8% of story score: nothing is mis-penalised, but nothing is
caught either. Wanted: photos with a real horizon (sea, a table edge) to see
whether the detector recovers an injected tilt where it should.

## Tilt fixed, 2026-11-08

Two defects, both found by rotating real photos by known angles:

1. **Squashed angles.** Every frame is stretched to 320x180 whatever the photo's
   shape, so a 4:3 photo's 6 degree lean was drawn as about 4.5 (a portrait
   photo's far less). The analyser now reads the picture's displayed size from
   ffmpeg's banner (sample aspect and a 90 degree display matrix included) and
   scales vertical gradients back (`stretch`).
2. **Bin jumps on natural scenes.** The old detector let every strong pixel vote
   in 1 degree bins. It now pools Sobel gradients into 5x5 structure tensors,
   keeps only coherent (straight-edge) windows, bins at a quarter degree and
   smooths before taking the peak.

Harness (not committed: it needs the photos): rotate each of 11 OpenCV sample
photos by -6, -3, -1.5, 0, 1.5, 3, 6 degrees, crop the corners, and count the
share of readings whose change from the unrotated reading is within 1 degree of
the injected angle (66 readings, tilt function alone):

| detector | within 1 degree | median error |
|---|---|---|
| before | 26% | 2.95 deg |
| new, no aspect correction | 42% | 1.27 deg |
| new, with it | 61% | 0.61 deg |

Through the real pipeline (`eval/real-photo-tilt-2026-11-08.md`), the change from
the unrotated reading for injected 0, 1, 2, 4, 8 degrees is 0, 0.98, 1.98, 3.72,
7.75 on `building.jpg` (it read nonsense before), 0, 1.00, 1.99, 3.75, 7.73 on
`left01.jpg` and 0, 0.72, 1.54, 3.25, 6.59 on `board.jpg` (under-reads about 15%).

Still wrong: photos with no straight axis lines (lena, fruits, the aeroplane
shots) give a random angle at a confidence of 0.11 to 0.17, which is the chance
level (a 3 degree window of 30 is 0.10), so the story penalty, which is
multiplied by confidence, stays small. `stuff.jpg` reads 1.8 degrees level and
over-reads on rotation. Confidence is not yet calibrated against a human's
"crooked" call; still wanted: photos with a real horizon and a person's labels.
The tilt function costs about 0.12 s a frame in plain Python (not timed against
the old one).

## Earlier the same day: a Hough tilt estimator (replaced by the section above)

Another session landed this (#14063) while the structure-tensor detector above
was being built. On the 66-reading harness above the Hough version scored 33%
within 1 degree (median error 1.49 degrees) against 61% (0.61) for the
structure-tensor one with the aspect correction, and read building and home
photos wrongly where the new one tracks them. Its confidence separated
line-rich photos from the rest more sharply (0.8 on left01 and sudoku, 0.01 to
0.05 on natural scenes, against 0.4 and 0.1 to 0.17), which is worth borrowing.
The record of what it measured is kept below.


The old estimator (a magnitude-weighted angle histogram over every edge pixel)
is replaced by a Hough vote over long straight runs (`tilt_from_frame`, its
docstring has the method). Raw rows: `real-photo-calibration-tilt-2026-11-08.md`,
three more OpenCV samples (Apache-2.0): `messi5.jpg`, `board.jpg`, `building.jpg`.
In a scratch run on seven photos, the old code gave confidence 0.03 to 0.10
everywhere, so it could not tell a usable photo from an unusable one; the new
confidence is 0.14 to 0.24 on the three photos with long straight lines
(messi5, board, building) and 0.00 to 0.05 on fruits, lena, home and the aerial.

| photo | injected 0, 1, 2, 4, 8 degrees | verdict |
|---|---|---|
| messi5 (pitch lines) | reads +1.70, +1.82, +1.90, +3.56, +7.51 | tracks: the 8 degree step moves the read by 5.8, not 8 (the frame is stretched to 320x180, which flattens angles by about 0.75 on a 548x342 photo; not corrected yet) |
| board (chessboard, perspective) | +0.06, +1.88, +2.01, +2.07, +2.08 | saturates near 2 degrees: perspective lines dominate; not recovered |
| building | -2.07, -2.02, -5.02, -3.53, -1.95 | not recovered, as before; the facade has many angles |

So: one real photo now follows an injected tilt where none did, two do not,
and the confidence separates line-rich photos from the rest. That is a first
look on a handful of photos, not a calibration. Next: correct the 320x180
stretch using the source aspect ratio; find photos with a true sea horizon;
leave perspective-heavy scenes at low confidence on purpose (a leaning
facade is not a crooked camera).
Existing unit tests (synthetic horizons, diagonal-only frames, plain frames)
still pass; `tests/test_workspace_health.py::test_unreadable_render_input...`
fails here only because the sandbox runs as root (it also fails on `main`).

## Tilt confidence made chance-corrected, 2026-11-09

On scenes with no straight axis lines the old confidence sat at 0.11 to 0.17,
which is the chance level: a 3 degree window out of the 30 degree search range
holds 10% of evenly spread votes. `tilt_from_frame` now returns
`(share - 0.10) / 0.90`, clamped to 0..1, so a frame with no dominant angle reads
about 0 and a line-rich photo keeps most of its value. Random-grain frames are
asserted below 0.1 (was below 0.2). The story penalty is multiplied by this
confidence, so no-line scenes are now not penalised at all. Not re-run on the
real photos (the harness needs fetched images and the sandbox lacks PIL); the
change is a fixed monotone rescale, so ordering of photos by confidence is
unchanged. Still wanted: photos with a real horizon and human "crooked" labels.

## Chance-corrected confidence re-run on real photos, 2026-11-09

`tools/tilt_confidence_check.py` rotates 10 OpenCV sample photos (building,
butterfly, board, left01, messi5, fruits, lena, home, aero1, stuff; sudoku is
gone upstream) by -6, -3, -1.5, 1.5, 3 and 6 degrees (60 readings) and bins each
by the confidence of the photo's tilt reading. "Within 1" is the share whose
change from the unrotated reading is within 1 degree of the injected angle.

| confidence | readings | within 1 degree | median error |
|---|---|---|---|
| under 0.05 | 22 | 45% | 1.16 deg |
| 0.05 to 0.15 | 25 | 64% | 0.75 deg |
| 0.15 to 0.4 | 13 | 85% | 0.32 deg |
| all | 60 | 62% | 0.77 deg |

So the chance-corrected confidence does what it should: accuracy rises with it,
and the story penalty (confidence-weighted) leans hardest where the reading is
most trustworthy. The top photos by unrotated confidence are left01 (0.38) and
board (0.29). Still a handful of photos with injected, not human-labelled, tilt;
a real horizon set remains wanted.
