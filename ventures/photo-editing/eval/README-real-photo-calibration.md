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
| tilt | rotation 0 to 8 degrees | **not recovered**: confidence 0.04 to 0.10 on both; building reads -3, -2, -2, -5, 0 for 0, 1, 2, 4, 8 | fails on natural scenes |

The tilt estimate needs long straight axis-aligned edges. A butterfly has none
and a building has perspective lines at many angles, so the peak bin jumps. The
story penalty is already multiplied by confidence, so at 0.1 or less it costs a
frame under 0.8% of story score: nothing is mis-penalised, but nothing is
caught either. Wanted: photos with a real horizon (sea, a table edge) to see
whether the detector recovers an injected tilt where it should.
