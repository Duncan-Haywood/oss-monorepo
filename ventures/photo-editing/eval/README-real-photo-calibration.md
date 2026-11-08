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

## Update 2026-11-08 (later): a Hough tilt estimator, and what it still misses

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
