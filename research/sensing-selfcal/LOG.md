# sensing-selfcal research log

## 2026-11-11 · Milestone 1 planned: target-free self-calibration against Zhang on a real stereo pair

Written before any experiment was run.

- **Data.** OpenCV's `samples/data` stereo calibration set, `left01..14.jpg` and `right01..14.jpg` (index 10 absent in both), 640×480, a 9×6-inner-corner checkerboard, Apache-2.0. Two real cameras, 13 views each.
- **Reference.** Zhang calibration with the board's known geometry (`cv2.calibrateCamera`, model fx = fy = f, cx, cy, k1, k2) on all 13 views of each camera; interval by bootstrap over views.
- **Target-free solver.** The same detected corners, but the 54 board points become free 3-D unknowns (no planarity, no spacing): initial focal guessed 30% wrong, two-view initialisation from the homography between images (no board metric), PnP for the rest, then bundle adjustment over poses, points and intrinsics (f, cx, cy, k1). Covariance from the Gauss–Newton normal matrix with the gauge fixed, scaled by the residual variance.
- **H1.** On all 13 views, target-free f lies within 2% of Zhang's f for both cameras. Refuted if either is further.
- **H2 (the solver knows when it is wrong).** Over random view subsets of size 4 to 12, the z-score (target-free f − all-view Zhang f) / σ_f(target-free) has rms ≤ 2. Refuted if rms > 2, i.e. the covariance is overconfident.
- **H3 (price of no target).** Target-free σ_f is at least twice Zhang's on the same views, and the ratio falls as views are added. Refuted if the ratio is below 2 at 13 views.
