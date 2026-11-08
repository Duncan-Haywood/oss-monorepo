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
