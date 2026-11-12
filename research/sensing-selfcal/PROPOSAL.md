# Proposal: target-free camera self-calibration that knows when it is wrong

Programme `sensing-selfcal`, opened 2026-11-11 (track 15, sensing). Written with
AI assistance (Claude Code). This is a plan, not a result: nothing below has been
measured unless it cites a file in this repository. `research/_shared/cite_check.py`
could not reach doi.org, Crossref or arXiv from this session (proxy refused), so
every DOI below is from memory and marked **[unchecked]**: check each before reuse.
Claims about what a work does come from its abstract and standard knowledge of the
field, not a full re-reading in this session.

## Question

When a robot's camera is recalibrated in the field from the features it already
tracks, with no calibration target, how close does bundle adjustment get to a
target calibration of the same camera, which motions and scenes make it fail, and
can the solver's own covariance tell the robot, before it trusts the result,
whether the new intrinsics are better than the ones it had?

It is open because the theory of self-calibration (Maybank and Faugeras 1992;
Pollefeys et al. 1999; Triggs 1998 for planar scenes) says *when* intrinsics are
identifiable in exact arithmetic, and online self-calibration systems (Keivan and
Sibley 2014; Nobre et al. 2017) estimate them inside SLAM, but the step a deployed
robot needs, a calibrated *confidence* that says "accept this update" or "keep the
old calibration", has not been checked against a target reference on real images
with real detection noise, an imperfect target and unmodelled lens terms.

## Why it matters

Cameras on field robots, agricultural and construction machines, drones and cars
lose calibration to knocks, temperature and lens refocusing, and taking a robot out
of service to wave a checkerboard in front of it costs labour and uptime. A
self-calibration that comes with an honest error bar lets the robot recalibrate in
place and, just as important, refuse a bad update. The number it moves is
reprojection and metric error of downstream mapping after recalibration, and the
fraction of updates that are accepted when they should be. The people who would act
on it are perception engineers on robot fleets (the ARPG lab's field robots run
exactly such multi-sensor self-calibration, Nobre et al. 2017). The artefact is a
small Python library: target-free bundle adjustment with gauge-correct covariance and
an accept/reject test, checked on real images.

## Related work

**Target calibration (the reference).**
- Zhang (2000), a flexible new technique for camera calibration, *IEEE TPAMI* 22(11),
  doi:10.1109/34.888718 **[unchecked]**. Plane-based calibration with a known target,
  what `cv2.calibrateCamera` implements. Needs the target's geometry; says nothing
  about calibrating without one.
- Sturm and Maybank (1999), on plane-based camera calibration, CVPR,
  doi:10.1109/CVPR.1999.786974 **[unchecked]**. Singularities of plane-based
  calibration (which board poses give no information). Target-based only.
- Strobl and Hirzinger (2011), more accurate pinhole camera calibration with
  imperfect planar target, ICCV workshops, doi:10.1109/ICCVW.2011.6130369
  **[unchecked]**. Shows a printed board is not the plane the model assumes and
  estimates its deformation. Relevant to why a target is not ground truth; does not
  remove the target.
- Duda and Frese (2018), accurate detection and localization of checkerboard corners
  for calibration, BMVC **[unchecked; no DOI]**. The sector-based localiser behind
  OpenCV's `findChessboardCornersSB`, more accurate than `cornerSubPix` in their tests;
  milestone 6 uses it as the second localiser. Target detection only.
- Furgale, Rehder and Siegwart (2013), unified temporal and spatial calibration for
  multi-sensor systems (Kalibr), IROS, doi:10.1109/IROS.2013.6696514 **[unchecked]**.
  The standard robotics calibration toolbox; target-based.

**Self-calibration theory.**
- Maybank and Faugeras (1992), a theory of self-calibration of a moving camera,
  *IJCV* 8, doi:10.1007/BF00127812 **[unchecked]**. Kruppa equations; intrinsics from
  correspondences alone. Exact-arithmetic identifiability, no noise model.
- Triggs (1998), autocalibration from planar scenes, ECCV, doi:10.1007/BFb0055661
  **[unchecked]**. Planar scenes suffice given enough views. Algebraic; no study of
  the noise-level accuracy against a target.
- Pollefeys, Koch and Van Gool (1999), self-calibration and metric reconstruction in
  spite of varying and unknown intrinsic camera parameters, *IJCV* 32,
  doi:10.1023/A:1008109111715 **[unchecked]**. Practical stratified self-calibration;
  accuracy shown on examples, no calibrated confidence.
- Sturm (1997), critical motion sequences for monocular self-calibration and
  uncalibrated Euclidean reconstruction, CVPR, doi:10.1109/CVPR.1997.609467
  **[unchecked]**. The motions for which self-calibration is impossible; the failure
  map our accept test has to detect.

**Bundle adjustment and its uncertainty.**
- Triggs, McLauchlan, Hartley and Fitzgibbon (2000), bundle adjustment: a modern
  synthesis, Vision Algorithms workshop, doi:10.1007/3-540-44480-7_21 **[unchecked]**.
  The method we use, including gauge freedom and covariance. Not evaluated against a
  target calibration.
- Agarwal, Snavely, Seitz and Szeliski (2010), bundle adjustment in the large, ECCV,
  doi:10.1007/978-3-642-15552-9_3 **[unchecked]**. Scale and solvers on real
  community photo problems; intrinsics accuracy not checked against ground truth.
- Schönberger and Frahm (2016), structure-from-motion revisited (COLMAP), CVPR,
  doi:10.1109/CVPR.2016.445 **[unchecked]**. The open SfM tool that refines
  intrinsics by default; reports no calibrated uncertainty for them.
- Förstner and Wrobel (2016), *Photogrammetric Computer Vision*, Springer,
  doi:10.1007/978-3-319-11550-4 **[unchecked]**. Self-calibrating bundle adjustment
  and its statistical tests as photogrammetry practises them; the accept test we
  build is in this tradition.

**Online self-calibration on robots.**
- Keivan and Sibley (2014), constant-time monocular self-calibration, ROBIO,
  doi:10.1109/ROBIO.2014.7090625 **[unchecked]**. Estimates intrinsics online in a
  sliding window and selects informative segments; covariance used to pick segments,
  not validated against a target on real data at the level we propose.
- Nobre, Kasper and Heckman (2017), drift-correcting self-calibration for
  visual-inertial SLAM, ICRA, doi:10.1109/ICRA.2017.7989731 **[unchecked]**, and
  Nobre, Heckman, Ozog, Wolcott and Walls (2017), online probabilistic change
  detection in feature-based maps, ICRA **[unchecked, no DOI recalled]** (ARPG). Change detection
  for calibration; the closest robotics prior work.
- Peng and Sturm (2019), calibration wizard: a guidance system for camera calibration
  based on modelling geometric and corner uncertainty, ICCV, arXiv:1811.03264
  **[unchecked]**. Uses predicted uncertainty to choose the next target pose. Needs a
  target.
- Richardson, Strom and Olson (2013), AprilCal: assisted and repeatable camera
  calibration, IROS, doi:10.1109/IROS.2013.6696595 **[unchecked]**. Same idea,
  target-based.

**Our own earlier work** (synthetic, this repository): `sensing-ba`,
`sensing-bafocal`, `sensing-bak2`, `sensing-bak2wide`, `sensing-bapp`,
`sensing-baoutlier`, `sensing-epigate`, `sensing-gatemix`, `sensing-gatecorr`,
`sensing-matchreal`, `sensing-calibviews`. They found when synthetic
self-calibrating BA recovers focal length and distortion and how mismatches break it,
all against a known simulated truth; none uses real images for the self-calibration.

## Gap

No published study, to our knowledge, scores target-free self-calibrating bundle
adjustment against a target calibration *of the same real camera from the same
images*, and asks whether the solver's covariance is calibrated (z-scores with unit
spread) across view subsets, scene types and unmodelled lens terms, so that a robot
can turn it into an accept/reject rule. The narrow claim: an empirical calibration
study of self-calibration uncertainty on real images, plus an accept test with a
measured false-accept rate.

## Hypotheses

- **H1 (accuracy).** On a real camera with ≥ 10 well-spread views, target-free
  self-calibration recovers f within 1% of the target calibration. Refuted by a
  larger gap on either camera of the test set.
- **H2 (honest covariance).** The z-score of target-free f against the all-view
  target reference has rms ≤ 2 across random view subsets. Refuted if rms > 2
  (overconfident).
- **H3 (price of no target).** Target-free σ_f is at least twice the target's.
  Refuted if the ratio is below 2 with all views.
- **H4 (accept test).** A χ² test on the update (old vs new intrinsics, both
  covariances) rejects ≥ 90% of updates from critical or near-critical motions
  (Sturm 1997) while accepting ≥ 90% of good ones. Refuted otherwise.
- **H5 (natural features).** With natural-feature matches instead of corners
  (mismatches, lower localisation accuracy, `sensing-matchreal`), H2 still holds
  after a robust loss. Refuted if rms z > 2.

## Method

Theory: derive the Fisher information of the intrinsics under target-free BA for
planar and general scenes, and the condition number as a function of view spread,
to predict where H2 and H4 fail (Sturm 1997 gives the singular set). Experiments:
real images first. Milestone 1 uses OpenCV's stereo calibration set (two real
cameras, 13 views each, Apache-2.0) with the board's corners as correspondences but
its geometry withheld. Later milestones use natural features (OpenCV SIFT) on
openly licensed multi-view sets with a target calibration of the same camera, and
an owner capture (phone camera, board and scene photos) where no licensed set fits.
Solver: `scipy.optimize.least_squares` with a sparse Jacobian; covariance by the
gauge-invariant pseudo-inverse (Triggs et al. 2000). Every number is produced by
running the code on the images.

## Evaluation

Baselines: Zhang target calibration (OpenCV), COLMAP's intrinsic refinement where a
build is available, and the synthetic results of the `sensing-ba*` projects.
Metrics: |Δf|/f, principal-point offset, distortion error, z-score rms and coverage
of 1σ/2σ intervals, accept-test ROC. Seeds: subsets drawn from fixed seeds; 95%
intervals by bootstrap over views; paired tests (Wilcoxon) for method comparisons.
Ablations: distortion model order, initial focal error, number and spread of views,
planar vs non-planar scenes, mismatch rate.

## Milestones

1. Real-data anchor: target-free BA against Zhang on OpenCV's stereo set; H1–H3.
   **(this session; see `LOG.md`)**
2. Identifiability map: condition number and z-scores against view spread on the
   same real views (rotation-only and near-critical subsets), H4's first test.
3. (a) Is the σ gap real, and does a cluster-robust or jackknife σ fix it (H8–H10,
   done 2026-11-11, see `LOG.md`); (b) natural features: SIFT matches on an openly
   licensed multi-view set with a known calibration; H5.
4. The accept/reject test and its false-accept rate across milestones 1–3
   **(done 2026-11-12, H18–H22, see `LOG.md`)**.
5. Unmodelled lens terms (k2, principal point) on real data, tying to
   `sensing-bak2` and `sensing-bapp`.
6. Owner capture (owner step): a phone or machine-vision camera, a board and
   several scenes, to test across cameras.
7. Paper draft.

## Target venue

*IEEE Robotics and Automation Letters* (8 pages, with an ICRA/IROS presentation
option), or the ISPRS Journal of Photogrammetry and Remote Sensing for the
statistical-test angle. An aim, not a claim of acceptance.

## Deep-tech application

The system is a camera on a field robot or a construction or agricultural machine
that runs visual odometry or mapping. The number it moves is calibration error after
an in-field update and the rate of wrongly accepted updates. Fleet perception
engineers would act on it by replacing scheduled target recalibration with
on-line updates gated by the test. Trying it on the real thing needs logged images
from such a machine before and after a deliberate lens disturbance, with a target
calibration as reference (an owner step or a partner's data).
