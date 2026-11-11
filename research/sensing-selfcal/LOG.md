# sensing-selfcal research log

## 2026-11-11 · Milestone 2 result: geometry predicts the error, σ stays 2× small, and Zhang's σ is far worse near the critical set

- **Solver fixed.** The cap was not only the gauge: holding view `ref`'s pose fixed left the scale free (the initialisation puts that camera at the world origin, so its translation is zero), and scipy's `trf`/`lsmr` crawled even once the scale was pinned too (corner 0's depth). Levenberg–Marquardt on a dense analytic Jacobian (checked against finite differences, max error 1e-6 relative) converges in 21–23 evaluations on all 13 views and in at most 177 on any subset: **560 of 560 solves converged on tolerance**. All-view f moved by 0.0004 px (534.8239 / 538.4302).
- **H2 rerun held.** Same 360 subsets of 4–12 views: rms z 1.945 (95% 1.75–2.12) against milestone 1's 1.944; median f change 0.002 px, largest 0.66 px. The cap was not the cause of the 2× overconfidence.
- **H6 held.** Spearman ρ between view spread and |Δf|/f: −0.46 (left, n 240) and −0.58 (right, n 240), p < 1e-13. The reported σ also tracks the error (ρ +0.39 / +0.45).
- **H7 refuted.** On the 160 near-critical subsets (spread 7–36°) rms z is 2.41 (95% 2.09–2.81); 20% have |z| > 3. Unplanned but striking: Zhang's σ on the same subsets is far less honest, rms z 5.83, and its median error is larger than the target-free one at 4–6 views (1.50 / 1.15 / 1.08% against 1.09 / 0.99 / 0.82%).
- **H4 first test refuted.** The 0.5% precision gate rejected 92% (56 of 61) of bad updates (> 2% off) but accepted only 84% (340 of 407) of good ones (≤ 1%). The five bad accepts were 2.0–2.9% off with σ/f 0.45–0.48%, just under the gate. Doubling σ (unplanned) rejects every bad update but accepts only 37% of good ones.
- **Unplanned: σ inflation does not transfer cleanly between cameras.** κ = rms z fitted on left (2.21) gives right-camera rms z 0.74 (over-cautious); κ from right (1.63) gives left rms z 1.35 and 2σ coverage 85% (random) and 82% (near-critical). Median error / σ by σ bin is 1.0–1.8, so the overconfidence sits in the tails more than in the typical subset.
- **No rotation-only subsets.** The milestone plan named rotation-only motions; this data set has a moving board and no such views, so near-critical here means near-parallel board planes only.

## 2026-11-11 · Milestone 2 planned: does the view geometry predict the error, and can σ gate an update?

Written before any milestone-2 experiment was run.

- **Solver fix first.** Milestone 1's solves all stopped on the 1,000-evaluation cap. Fix the gauge by holding view 0's pose (rotation and translation) constant: that removes all 7 similarity directions (a fixed non-zero translation pins the scale), so the normal matrix is invertible and the intrinsics' covariance is the plain inverse, equal to the gauge-invariant pseudo-inverse. Raise the cap and record convergence status for every solve.
- **H2 rerun (was the cap an artefact?).** Rerun milestone 1's 400 random subsets (same seeds) with the fixed solver. Predicted: rms z for 4–12 views stays within ±0.2 of 1.94 (the all-view f already agreed across starts to 0.001 px). Refuted if it moves by more than 0.2.
- **View spread.** For each view, the board normal in the camera frame from the all-view Zhang poses. A subset's spread is the largest angle between two of its normals. All parallel normals is the planar critical case (Sturm and Maybank 1999): f is then unidentifiable.
- **Near-critical subsets.** For sizes 3, 4, 5 and 6, enumerate every subset of the 13 views and keep the 20 with the smallest spread, per camera (160 solves), alongside the 400 random ones.
- **H6 (geometry predicts error).** Pooled over random and near-critical subsets of 4–12 views, Spearman ρ between spread and |Δf|/f (against all-view Zhang) is ≤ −0.3 on each camera. Refuted if ρ > −0.3 on either.
- **H7 (σ flags near-critical subsets).** On the near-critical subsets, rms z ≤ 2, i.e. σ grows as fast as the error. Refuted if rms z > 2.
- **H4, first test (a precision gate).** Accept an update iff σ_f / f ≤ 0.5%. A good update has |Δf|/f ≤ 1%, a bad one > 2% (between is not scored). Pooled over all subsets and both cameras, the gate should reject ≥ 90% of bad updates and accept ≥ 90% of good ones. Refuted if either rate is below 90%. The proposal's χ² test against an old calibration needs a disturbed camera, which this data set does not have; that test waits for milestone 4.

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
