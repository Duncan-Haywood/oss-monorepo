# sensing-selfcal research log

## 2026-11-11 · Milestone 1 result: target-free BA matches Zhang to 0.2%, the board bends, σ is 2× optimistic

- **H1 held.** All 13 views: target-free f 534.82 / 538.43 px against Zhang's 535.62 / 539.71 (left / right), gaps −0.15% / −0.24%, under 1σ; the same f from 0.7× and 1.3× starts.
- **H2 held narrowly.** Subsets of 4–12 views (360 solves): rms z 1.94, 95% bootstrap 1.75–2.12. Ideal is 1, so σ is about twice too small; worst at 3–7 views (2.1–2.8). Zhang's own σ against the same reference: 2.16. Not planned: subsets of 3 views (rms z 2.79, worst error 20%).
- **H3 refuted.** σ ratio target-free / Zhang 1.12 at 13 views (predicted ≥ 2); 2.9 at 3 views, falling with views as predicted.
- **Unplanned finding: the board is not flat.** The free corners leave their best plane by 0.0077 square widths rms (max 0.024) on both cameras, and the two cameras' out-of-plane maps correlate at 0.903 (0.909 with k2). Target-free reprojection rms 0.26 / 0.29 px against Zhang's 0.42 / 0.49. The principal point's c_y differs by 8.7 px (5.3σ) and 5.2 px (2.9σ); the bend is the likely cause, not yet tested.
- **Deviation from the plan.** Zhang's σ_f came out as 0 at first: with a fixed aspect ratio OpenCV reports it in the f_y slot; fixed before any analysis. Sizes 3–12 were run (plan said 4–12); H2 is scored on 4–12 as planned.
- **Problem found.** Every solve stopped on the 1,000-evaluation cap (the similarity gauge slows trust-region). For all-view fits f agrees across starts to 0.001 px; subsets were not checked. Milestone 2 should fix the gauge and use an analytic Jacobian.

## 2026-11-11 · Milestone 1 planned: target-free self-calibration against Zhang on a real stereo pair

Written before any experiment was run.

- **Data.** OpenCV's `samples/data` stereo calibration set, `left01..14.jpg` and `right01..14.jpg` (index 10 absent in both), 640×480, a 9×6-inner-corner checkerboard, Apache-2.0. Two real cameras, 13 views each.
- **Reference.** Zhang calibration with the board's known geometry (`cv2.calibrateCamera`, model fx = fy = f, cx, cy, k1, k2) on all 13 views of each camera; interval by bootstrap over views.
- **Target-free solver.** The same detected corners, but the 54 board points become free 3-D unknowns (no planarity, no spacing): initial focal guessed 30% wrong, two-view initialisation from the homography between images (no board metric), PnP for the rest, then bundle adjustment over poses, points and intrinsics (f, cx, cy, k1). Covariance from the Gauss–Newton normal matrix with the gauge fixed, scaled by the residual variance.
- **H1.** On all 13 views, target-free f lies within 2% of Zhang's f for both cameras. Refuted if either is further.
- **H2 (the solver knows when it is wrong).** Over random view subsets of size 4 to 12, the z-score (target-free f − all-view Zhang f) / σ_f(target-free) has rms ≤ 2. Refuted if rms > 2, i.e. the covariance is overconfident.
- **H3 (price of no target).** Target-free σ_f is at least twice Zhang's on the same views, and the ratio falls as views are added. Refuted if the ratio is below 2 at 13 views.
