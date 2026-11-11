# sensing-selfcal: can a robot camera calibrate itself without a checkerboard, and does it know when it is wrong?

**Live page:** https://marisstella.app/research/sensing-selfcal/

A research programme (proposal: [`PROPOSAL.md`](PROPOSAL.md); log: [`LOG.md`](LOG.md)) on
**target-free camera self-calibration**: recovering a camera's focal length, principal
point and lens distortion by bundle adjustment from the features it tracks, without a
calibration target, and testing whether the solver's own uncertainty is honest enough for a
field robot to accept or reject the update.

**Milestone 1 headline, on two real cameras** (OpenCV's stereo calibration photos, 13 views
each): withholding the checkerboard's geometry and solving for the 54 corners as free 3-D
points, bundle adjustment started 30% off lands **within 0.15% (left) and 0.24% (right) of
Zhang's target calibration** of the focal length, with a reported σ only **1.12× Zhang's**
(not the ≥2× we predicted). The free points also show that **the board is not flat**: the
reconstructed corners leave the best plane by 0.77% of a square rms (2.4% at worst), and the
two cameras, solved independently, reconstruct the same bend (correlation 0.90). Over 400
random view subsets the reported σ<sub>f</sub> is about **2× too small** (rms z 1.94, 95%
1.75–2.12, against an ideal 1), and Zhang's own σ is no better (2.16).

**Milestone 2 headline** (same views, 560 solves, all converged): the **view geometry predicts
the error** (Spearman ρ −0.46 and −0.58 between the spread of board orientations and the focal
error), and the reported σ tracks it too (ρ +0.39 / +0.45), but **σ stays about 2× too small**,
2.4× on near-critical subsets where the boards are close to parallel. There, **Zhang's own σ
is far worse** (rms z 5.8) and its focal length is further off than the target-free one. A
first accept gate (σ<sub>f</sub>/f ≤ 0.5%) rejected 92% of bad updates but accepted only 84%
of good ones, short of the 90/90 target.

**Milestone 3 headline** (same 560 subsets, plus 3,480 leave-one-view-out re-solves): the
2× overconfidence is **real, not an artefact of the checkerboard reference**: scored against
the target-free all-view solution with the nested variance, rms z is still 2.28. A
**leave-one-view-out jackknife σ is honest without any fitted factor** (rms z 0.70 / 0.65,
2σ coverage 97–99%, rms z 1.01 on near-critical subsets where the reported σ gives 2.34),
while the cluster-robust sandwich only helps on the left camera (1.76 / 1.59). But the
jackknife **ranks updates worse** (ROC AUC 0.75 against 0.91 for the reported σ) and is
very conservative at 4 views, so **an honest σ and a good gate are different statistics**.

![rms z by subset size for the reported, sandwich and jackknife σ, both cameras](experiments/m3_robust/rms_z_by_sigma.png)

![rms z-score of the focal length and median focal error against the number of views, target-free BA vs Zhang](experiments/m1_real/selfcal_vs_zhang.png)

## Why

Robot, drone and machine cameras drift out of calibration from knocks, heat and refocusing.
Recalibrating with a board takes the machine out of service. Self-calibration from scene
features avoids that, but only if the robot can tell a good update from a bad one. This
programme measures that on real images. Lab tag: ARPG (Christoffer Heckman), whose
multi-sensor SLAM with online self-calibration and change detection (Nobre et al., 2017) is
the closest robotics work.

## Milestone 1: target-free BA against Zhang on a real stereo pair

**Data.** `data/left01..14.jpg`, `data/right01..14.jpg` (no index 10), 640×480, a 9×6
inner-corner checkerboard, from OpenCV's `samples/data` (Apache-2.0, fetched from
github.com/opencv/opencv, 4.x branch). Corners by `cv2.findChessboardCorners` and
`cornerSubPix`; all 26 images detect.

**Model** (both solvers): f<sub>x</sub> = f<sub>y</sub> = f, (c<sub>x</sub>, c<sub>y</sub>),
radial 1 + k<sub>1</sub>r<sup>2</sup> (k<sub>2</sub> as an ablation), no tangential terms.

**Reference.** Zhang calibration (`cv2.calibrateCameraExtended`) with the known board on all
13 views; σ from OpenCV.

**Target-free solver** (`src/selfcal.py`). The same pixels and correspondences, board
geometry withheld: 54 free 3-D points, 13 poses, 4 intrinsics. Start: f 30% off (both
directions tried), view `ref`'s corners pushed onto the plane z = 1 of its own camera (as if
the board faced it), PnP for every view. Then `scipy.optimize.least_squares` (trf, sparse
Jacobian). σ from the Gauss–Newton normal matrix, scaled by the residual variance, with the
7 similarity-gauge directions removed by pseudo-inverse.

**Results, all 13 views** (`experiments/m1_real/summary.json`):

| | left | right |
|---|---|---|
| Zhang f (σ), px | 535.62 (0.88) | 539.71 (1.07) |
| Target-free f (σ), px | 534.82 (0.98) | 538.43 (1.20) |
| Gap | −0.15% (−0.6 σ) | −0.24% (−0.8 σ) |
| σ ratio, target-free / Zhang | 1.12 | 1.12 |
| Reprojection rms, Zhang / target-free, px | 0.42 / 0.26 | 0.49 / 0.29 |
| c<sub>y</sub> gap, px (σ) | +8.7 (5.3 σ) | +5.2 (2.9 σ) |
| Same f from a 0.7× start | 534.82 | 538.43 |
| f with k<sub>2</sub> added, Zhang / target-free | 536.27 / 535.72 | 541.07 / 538.15 |

**View subsets.** 20 random subsets of each size 3 to 12 per camera (400 solves, seeds fixed
in `run.py`), started 30% high. z = (f<sub>subset</sub> − f<sub>Zhang, all</sub>) / σ<sub>f, subset</sub>:

| Views | rms z, target-free | rms z, Zhang | median σ ratio | median \|Δf\|, target-free | median \|Δf\|, Zhang |
|---|---|---|---|---|---|
| 3 | 2.79 | 3.27 | 2.91 | 1.76% | 0.60% |
| 4 | 2.20 | 2.32 | 1.54 | 0.54% | 0.37% |
| 6 | 2.68 | 3.02 | 1.28 | 0.60% | 0.33% |
| 8 | 1.56 | 2.14 | 1.17 | 0.30% | 0.20% |
| 10 | 1.77 | 2.06 | 1.12 | 0.25% | 0.15% |
| 12 | 1.05 | 0.43 | 1.13 | 0.16% | 0.05% |

(All sizes in `summary.json`.) The worst target-free subset (3 views) was 20% off; from 4
views the worst was 4.4%, from 8 views under 1%.

**Board flatness** (`experiments/m1_real/planarity.json`). The target-free corners deviate
from their best-fit plane by 0.0077 (left) and 0.0077 (right) square widths rms, 0.024 at
most; the out-of-plane heights from the two independently solved cameras correlate at 0.903
(0.909 with k<sub>2</sub>). Grid spacing varies by 0.3%. A flat-board model cannot fit that
bend, which is the likely reason the target-free fit has about 40% lower reprojection error and
part of the c<sub>y</sub> disagreement (Strobl and Hirzinger, 2011, found the same for
printed targets).

**Hypotheses** (pre-registered in `LOG.md`):
- H1 (f within 2% of Zhang with all views): **held**, 0.15% and 0.24%.
- H2 (rms z ≤ 2 over subsets of 4–12 views): **held narrowly**, 1.94 (95% bootstrap
  1.75–2.12). The σ is still about twice too small, most at 3 to 7 views.
- H3 (target-free σ ≥ 2× Zhang's at 13 views): **refuted**, 1.12×. The ratio does fall with
  views (2.9× at 3).

## Milestone 2: view geometry, near-critical subsets and a first accept gate

Pre-registered in `LOG.md` before any run; results in `experiments/m2_spread/summary.json`.

**Solver.** `selfcal_fixed_analytic` in `src/selfcal.py`: view `ref`'s pose and corner 0's
depth are held fixed (the 7 similarity directions; a zero translation at the reference camera
leaves the scale free, so the depth pin is needed), the Jacobian is analytic (tested against
finite differences), and Levenberg–Marquardt replaces milestone 1's trust-region/LSMR solver.
All 560 solves converged on tolerance, in at most 177 evaluations (21–23 on all 13 views).
All-view f moved by 0.0004 px.

**Geometry.** Each view's board normal in the camera frame comes from the all-view Zhang
poses; a subset's *spread* is the largest angle between two of its normals (0° = all boards
parallel, where f is unidentifiable; Sturm and Maybank 1999). All 13 views span 65°. Besides
milestone 1's 400 random subsets (same seeds), the 20 smallest-spread subsets of each size 3–6
per camera (160 *near-critical* subsets, spread 7–36°).

![focal error against view spread, and against the reported σ, random and near-critical subsets](experiments/m2_spread/spread_vs_error.png)

| | random, 4 views | random, 8 views | near-critical, 4 views | near-critical, 6 views |
|---|---|---|---|---|
| median spread | 51° | 61° | 20° | 33° |
| median \|Δf\|, target-free | 0.54% | 0.30% | 1.09% | 0.82% |
| median \|Δf\|, Zhang | 0.37% | 0.20% | 1.50% | 1.08% |
| rms z, target-free | 2.21 | 1.56 | 2.08 | 2.45 |
| rms z, Zhang | 2.32 | 2.14 | 6.24 | 6.23 |

**Hypotheses:**
- H2 rerun (does milestone 1's rms z survive convergence?): **held**, 1.945 (95% 1.75–2.12)
  against 1.944; median f change 0.002 px.
- H6 (spread predicts error, ρ ≤ −0.3 on each camera): **held**, −0.46 and −0.58.
- H7 (σ stays honest on near-critical subsets, rms z ≤ 2): **refuted**, 2.41 (95% 2.09–2.81),
  20% beyond 3σ. Zhang's σ on the same subsets: rms z 5.83.
- H4, first test (gate σ<sub>f</sub>/f ≤ 0.5%: reject ≥ 90% of updates > 2% off, accept
  ≥ 90% of those ≤ 1% off): **refuted**, rejects 92% (56/61), accepts 84% (340/407). The five
  bad updates it let through were 2.0–2.9% off with σ/f just under the gate.

**Unplanned checks** (reported as such): with σ doubled the gate rejects every bad update but
accepts only 37% of good ones. An inflation factor κ fitted on one camera's random subsets does
not transfer cleanly: κ 2.21 from the left camera makes the right camera's rms z 0.74; κ 1.63
from the right leaves the left at 1.35 with 85% 2σ coverage. The median error/σ ratio is
1.0–1.8 in every σ bin, so the overconfidence is in the tails more than in the typical subset.

**What it means for a robot.** The solver's σ is informative (it ranks subsets by error about
as well as the geometry does) but not calibrated, and a fixed σ threshold cannot hit 90/90 on
this data. Near-parallel views are where a target calibration is most misleading about its own
error, which is an argument for self-calibrating BA plus an honest gate rather than for the
board.

## Milestone 3: is the overconfidence real, and does a robust σ fix it?

Pre-registered in `LOG.md` before any run (H8–H10, H4's second test); results in
`experiments/m3_robust/summary.json`. Same 560 subsets and reference views as milestone 2,
same solver (all 560 converged again, identical f).

**Estimators** (`src/selfcal.py`, no fitted constants). *Sandwich* (Huber–White):
var f = G/(G − 1) Σ<sub>g</sub> ((J<sub>g</sub>b)·r<sub>g</sub>)², b = (JᵀJ)⁻¹e<sub>f</sub>,
clustered by view, by corner, or unclustered (HC0). *Jackknife*: re-solve without each view
in turn (cold start), var f = (k − 1)/k Σ (f<sub>(i)</sub> − f̄)². 3,473 of 3,480
leave-one-out solves converged on tolerance. On all 13 views the jackknife σ is 2.59 px (left)
and 1.74 px (right), against the reported 0.98 and 1.20.

| rms z, random subsets of 4–12 views | left | right | near-critical, 4–6 views |
|---|---|---|---|
| reported σ (Gauss–Newton) | 2.21 | 1.63 | 2.34 |
| sandwich, by view | 1.76 | 1.59 | 3.60 |
| sandwich, by corner | 2.30 | 1.73 | 2.80 |
| sandwich, unclustered | 2.32 | 1.89 | 2.66 |
| **jackknife over views** | **0.70** | **0.65** | **1.01** |
| 2σ coverage, reported / jackknife | 68% / 97% | 78% / 99% | 58% / 96% |

**Hypotheses:**
- H8 (the overconfidence is not the reference's fault): **held**. Against the target-free
  all-view f with the nested variance σ<sub>sub</sub>² − σ<sub>all</sub>², rms z is 2.28 (95%
  1.93–2.73; 302 subsets, 58 with σ<sub>sub</sub> ≤ σ<sub>all</sub> dropped). With the
  jackknife σ the same test gives 0.85 (0.61–1.10).
- H9 (jackknife σ honest, rms z in [0.7, 1.4] on each camera): **refuted, narrowly and on the
  safe side**: 0.703 (left) and 0.651 (right, 95% 0.56–0.74), i.e. slightly conservative. The
  view-clustered sandwich fails at 4–6 views as predicted (2.23).
- H10 (jackknife σ ranks good against bad updates better than the reported σ): **refuted**.
  ROC AUC 0.75 against 0.91 (difference −0.15, 95% −0.25 to −0.07; 388 good, 22 bad
  updates of 4–12 views). The sandwich variants also rank worse (0.76–0.89).
- H4, second test (gate σ<sub>jack</sub>/f ≤ 0.5%): **refuted**. It rejects every bad
  update but accepts only 19% of good ones (0% on near-critical subsets). Thresholds fitted on
  one camera do not transfer for any σ: the best is the reported σ (fit left, score right:
  accept 76%, reject 79%; fit right, score left: 91% / 88%).

**Why the jackknife is conservative where it is.** The jackknife variance is biased upward
(Efron and Stein, 1981), and here the bias is large where the estimator is most non-linear:
at 4 views each leave-one-out solve has only 3 views, where milestone 1 saw errors up to 20%,
so σ<sub>jack</sub> is a median 15× the reported σ and rms z drops to 0.33. From 6 to 11
views the ratio is 2–5× and rms z 0.55–0.94. That inflation is also what costs it as a
ranking statistic: it measures how unstable the subset is to losing a view, which is noisy
with few views, more than how far it is from the truth.

**What it means for a robot.** The reported σ's 2× gap is real miscalibration, and
correlated per-image error (what the sandwich assumes) explains little of it on the right
camera. A jackknife over frames gives an error bar a robot can trust as a bound, at k extra
solves, but should not be the accept statistic on its own; the next gate should rank by the
reported σ (and view spread) and use the jackknife only to refuse updates whose honest error
bar is too wide.

## Reproduce

```
pip install numpy scipy opencv-python-headless matplotlib pytest
python3 experiments/m1_real/run.py        # ~40 min on 4 cores; results.json
python3 experiments/m1_real/analyse.py    # summary.json, selfcal_vs_zhang.png
python3 experiments/m1_real/planarity.py  # ~3 min; planarity.json
python3 experiments/m2_spread/run.py      # ~10 min on 4 cores; results.json
python3 experiments/m2_spread/analyse.py  # summary.json, spread_vs_error.png
OMP_NUM_THREADS=1 python3 experiments/m3_robust/run.py   # ~9 min on 4 cores; results.json
python3 experiments/m3_robust/analyse.py  # summary.json, rms_z_by_sigma.png
python3 -m pytest tests
```

## Limitations

- One stereo rig, one board, one tutorial image set with strongly tilted views; the two
  cameras share every board pose, so they are not independent scenes.
- The corners are correspondences without mismatches and with checkerboard-grade (~0.1 to
  0.3 px) localisation. Natural features are milestone 3b.
- Zhang's all-view fit is a reference, not a lens ground truth, and its own flat-board
  assumption is wrong at the 1% level found above. The subset z-scores overlap the reference
  views (at 12 of 13 views almost entirely), which deflates z at large sizes.
- Milestone 1's solver stopped on its 1,000-evaluation cap in every solve. Milestone 2's
  gauge-fixed LM solver converges on all of them and reproduces milestone 1's numbers (rms z
  1.945 against 1.944), so the milestone 1 results stand.
- View spread uses the all-view Zhang poses, i.e. the board's geometry; a robot would read it
  from its own pose estimates. Near-critical here means near-parallel board planes only: the
  set has no rotation-only motion.
- Milestone 3 scores the robust σs on 22 bad updates, so the AUCs carry wide intervals; the
  jackknife needs k extra solves (median 2.7 s per subset here, all solves included).
- `cite_check.py` could not reach the DOI registries; citations are unchecked (see
  `PROPOSAL.md`).

## Next steps

Milestone 3b: natural features (SIFT) on an openly licensed multi-view set with a target
calibration of the same camera (H5). For the gate (milestone 4): a two-stage test that ranks by
the reported σ and view spread and vetoes with the jackknife σ, fitted on one camera and
scored on the other; a cheaper honest σ than k re-solves (a one-step, linearised jackknife
from the solution, or a delete-d jackknife for few views); and the χ² test against a
disturbed camera.

## References

Zhang (2000), *IEEE TPAMI* 22(11); Efron and Stein (1981), *Ann. Statist.* 9(3), the jackknife estimate of variance; White (1980), *Econometrica* 48(4), the sandwich covariance; Sturm and Maybank (1999), CVPR; Triggs et al. (2000), bundle adjustment: a modern
synthesis; Strobl and Hirzinger (2011), ICCV workshops; Nobre, Kasper and Heckman (2017),
ICRA; the full list with notes is in [`PROPOSAL.md`](PROPOSAL.md). Earlier synthetic work in
this repository: [`sensing-bafocal`](../sensing-bafocal/README.md),
[`sensing-calibviews`](../sensing-calibviews/README.md) (Zhang on random subsets of the same
left images).

Written with AI assistance (Claude Code). No affiliation with any lab named here is implied.
