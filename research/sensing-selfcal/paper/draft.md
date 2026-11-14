# Can a field camera trust its own self-calibration? Covariance, corner bias and an update test on real images

*First full draft (milestone 7 of the `sensing-selfcal` programme), 2026-11-13; revised the same day
with milestones 4e–4g (set size, every disjoint split, a robust jackknife) and on 2026-11-14 with
milestone 4h (a reference for the robust jackknife derived from a model) and milestone 4i (a reference
from the unit's own linearised bundle adjustment). Target venue: IEEE
Robotics and Automation Letters (an aim, not a claim of acceptance). Every number below comes from a
file under `../experiments/`; `python3 paper/check_numbers.py` checks each one against that file.
Citations are listed in `references.bib`; their DOIs could not be looked up from the session that
wrote this draft (the registries refused the proxy) and are marked unchecked there.*

## Abstract

A robot that re-estimates its camera intrinsics from the features it tracks, with no calibration
target, has to decide whether to adopt each new estimate. That decision rests on the solver's
uncertainty. We measure how honest that uncertainty is on real images of two real cameras
(OpenCV's stereo calibration set, 13 views each), with the checkerboard's geometry withheld from
the solver and used only as a reference. Target-free bundle adjustment recovers the focal length
within 0.15% and 0.24% of Zhang's target calibration, but its reported σ<sub>f</sub> is about twice
too small over 360 view subsets (rms z 1.94), and a χ² update test built on it fires on 72.5% of
splits of an unchanged camera (nominal 1%). A leave-one-view-out jackknife covariance brings the
false-alarm rate to 1.7–2.5% with nothing fitted from outside, at the price of power. We trace the
remaining set-to-set offset to a corner-localisation bias that renders of the real poses explain
exactly: the printed board's end squares are half width, which pulls OpenCV's default 11×11
`cornerSubPix` window up to 9.6 px off the corner and biases Zhang's focal length by +0.6–0.9%;
the sector-based `findChessboardCornersSB` is biased the other way (−0.1 to −0.4%) and a 5×5 window
is unbiased. On unbiased corners, scored on every one of the 1,716 disjoint splits per camera, the
focal length alone tested with a robust view jackknife (the MAD of the delete-one estimates) against a
plain χ²<sub>1</sub> reference detects a 2% focal change from 6 new views in 54% of splits at 2.3%
false alarms, but only because two errors cancel: under independent per-view offsets χ²<sub>1</sub>
would give that test 6.1% false alarms. With a reference derived from that model, which borrows
nothing, the test stays at 0.2–0.5% false alarms and catches the 2% change in 19% of splits. That model
ignores the views' geometry: a reference drawn from a linearisation of the unit's own 13-view solve,
which a robot gets from solves it already ran, predicts most of the jackknife's small-set inflation and
lifts detection to 33% at 0.4–1.4% false alarms; a tail
threshold borrowed from the sibling camera, which looked better on a 60-split sample (61%),
reaches 43% on every split. The jackknife's
overstatement is a small-set effect (7–8× at 4 views, 1.1–1.4× at 10), while the solver's own σ is
2–6× too small at every size. The practical message for fleet perception is two-sided: a view-level
jackknife makes in-field self-calibration safe to gate, and the corner localiser, not the solver,
decides whether the gate can see a 1–2% change.

## 1. Introduction

Cameras on field robots, construction and agricultural machines drift out of calibration from
knocks, heat and refocusing. Recalibrating with a target takes the machine out of service, so
online self-calibration from tracked features is attractive (Keivan and Sibley, 2014; Nobre, Kasper
and Heckman, 2017). The open question is not whether self-calibrating bundle adjustment can recover
intrinsics (the theory is old: Maybank and Faugeras, 1992; Triggs, 1998; Pollefeys et al., 1999),
but whether the robot can tell a good update from a bad one with the statistics it has on board.
Calibration toolboxes report a covariance (Furgale et al., 2013; Richardson et al., 2013; Peng and
Sturm, 2019), and photogrammetry has a long tradition of statistical tests on self-calibrating
adjustment (Förstner and Wrobel, 2016), yet we found no study that scores a target-free solver's
covariance against a target calibration *of the same real camera from the same images* and then
measures an accept/reject test's false-alarm rate and power on real disjoint view sets.

This paper does that on a small, fully open data set, and reports what broke along the way.
Contributions:

1. **A real-image calibration of the calibration.** Target-free BA against Zhang (2000) on two
   cameras, with z-scores over 360 view subsets, nested self-consistency, and three alternative
   covariances (view- and corner-clustered sandwiches, a view jackknife) (Sections 3–4).
2. **An update test with measured false alarms and power** on 2,145 view sets per camera and
   detector, with exact focal and principal-point disturbances and one real change, a swap to the
   other camera unit (Section 5).
3. **A corner-localiser bias diagnosed with a digital twin of the capture.** Renders of the 13 real
   board poses through a known camera, with blur, noise and JPEG matched to the real images, show
   that half-width end squares bias two of three standard localisers by up to 1.5% in f (Section 6).
4. **Recommendations a perception engineer can apply** (Section 8).

## 2. Setting and data

**Images.** OpenCV's `samples/data` stereo set, `left01–14.jpg` and `right01–14.jpg` (index 10
absent), 640×480, a 9×6-inner-corner checkerboard, Apache-2.0. Two real cameras, 13 views each; the
two cameras see the same board poses, so they are not independent scenes.

**Target-free solver.** The detected corners are correspondences; the 54 board points become free
3-D unknowns (no planarity, no spacing). Initial focal length 30% wrong, two-view initialisation
from the homography, PnP for the other views, then Levenberg–Marquardt bundle adjustment over poses,
points and (f, c<sub>x</sub>, c<sub>y</sub>, k<sub>1</sub>), gauge fixed by one view's pose and one
point's depth, dense analytic Jacobian. All 560 milestone-2 solves converged on tolerance (at most
177 evaluations). Reported covariance: the gauge-fixed Gauss–Newton inverse scaled by the residual
variance (Triggs et al., 2000).

**Reference.** Zhang calibration (`cv2.calibrateCamera`, f<sub>x</sub> = f<sub>y</sub>, k<sub>1</sub>,
k<sub>2</sub>) on all 13 views. Section 6 shows the reference itself depends on the corner localiser
at the 1% level, so we also report the target-free all-view solution as a reference (nested test).

**Localisers.** `cornerSubPix` with an 11×11 half-window (the common tutorial setting, used in
Sections 3–5 unless stated), a 5×5 half-window, and `findChessboardCornersSB` with
`CALIB_CB_ACCURACY` (Duda and Frese, 2018).

## 3. Does target-free BA match a target calibration?

On all 13 views the target-free focal length is 534.82 px (left) and 538.43 px (right), against
Zhang's 535.62 and 539.71: gaps of −0.15% and −0.24%, under 1σ, and the same f from a start 0.7×
or 1.3× the answer. The price of no target is small at 13 views: the target-free σ<sub>f</sub> is
1.12× Zhang's. The free points expose something the target model hides: the board is not flat.
The reconstructed corners leave their best plane by 0.77% of a square rms, and the two cameras,
solved independently, reconstruct the same bend (correlation 0.90). OpenCV's released-object
calibration (Strobl and Hirzinger, 2011) returns the same intrinsics, σ and board shape as our
solver to numerical precision: with the board points free, the target contributes only metric
scale, which carries no information about the intrinsics.

## 4. Is the reported uncertainty honest?

Over 360 random subsets of 4–12 views, z = (f<sub>subset</sub> − f<sub>Zhang, all</sub>)/σ<sub>f</sub>
has rms 1.94 (95% bootstrap 1.75–2.12); Zhang's own σ against the same reference gives 2.16.
Against the target-free all-view solution with the nested variance (σ<sub>sub</sub>² − σ<sub>all</sub>²),
rms z is still 2.28, so the 2× is not an artefact of the reference. View geometry predicts the error
(Spearman ρ between the spread of board orientations and |Δf|/f: −0.46 left, −0.58 right), but on
160 near-critical subsets (near-parallel boards, Sturm and Maybank, 1999) rms z rises to 2.41 and
Zhang's σ is far worse (rms z 5.83).

Three alternatives to the reported covariance, same subsets: a sandwich clustered by view (White,
1980) gives rms z 1.76 / 1.59; a corner-clustered sandwich and HC0 are no better than the reported σ;
a leave-one-view-out jackknife (Efron and Stein, 1981) gives 0.70 / 0.65 with 2σ coverage 97% / 99%,
and 1.01 on near-critical 4–6-view subsets where the reported σ gives 2.34. The jackknife is honest
and conservative, but it ranks updates worse: ROC AUC for good (≤ 1% error) against bad (> 2%)
updates is 0.75 against 0.91 for the reported σ (difference −0.15, 95% −0.25 to −0.07; only 22 bad
updates). An honest σ and a good ranking statistic are different statistics.

Neither a second radial term (k<sub>2</sub> = 0.143 ± 0.018 left, clearly non-zero) nor clustering by
board column fixes the 2×: nested rms z with k<sub>1</sub> + k<sub>2</sub> is 3.01 (2.00 without five
outlying subsets). The residuals were correlated along one board axis (0.44–0.56 between neighbours
along a column), which pointed at the corners rather than the lens (Section 6).

**How both error bars depend on the number of views.** On unbiased 5×5 corners (Section 6) we solved
every subset of 3 to 12 of the 13 views on both cameras (16,172 view sets) and compared each σ with the
real set-to-set spread of f, measured around the all-view solution (exact if each view adds an
independent offset) and, up to 6 views, between disjoint sets. The jackknife overstates the real spread
7.8× (left) and 8.2× (right) at 4 views against disjoint pairs, and against the all-view reference its
overstatement falls at every step from 4 to 10 views (left 6.7 to 1.1, right 6.7 to 1.4). Most of the
small-set excess comes from a few delete-one solves that land near the critical set: the median of the
per-set jackknife variances overstates only 2.4× and 4.1× at 4 views. The solver's own σ is 4–6× too
small on the left camera at every size from 4 to 10 views, worse than the 2× of Section 4's 11×11
corners, consistent with Section 6's finding that better corners make σ less honest. Below 6 views
neither σ is usable as an error bar; from about 10 views the plain jackknife is a mildly conservative
one. On the right camera the two real references disagree (1.22–1.66 at 4–6 views), so its views do not
add independent offsets and its figures above 6 views are less certain.

## 5. An accept/reject test on disjoint view sets

**Protocol.** For k = 3–6, 60 splits per k and camera draw an *old* set of 7 views and a disjoint
*new* set of k views from the 13. Unchanged camera (S0); an exact focal change of ±0.5, ±1, ±2, ±4% applied
to the new views' solution (S1); a principal-point shift of 2, 5 or 10 px (S2); and one real change, the
new views taken from the other camera (S3, 0.67% in f and 17 px in c<sub>x</sub>). The statistic is
W = d<sup>T</sup>(Σ<sub>old</sub> + Σ<sub>new</sub>)<sup>−1</sup>d over (f, c<sub>x</sub>, c<sub>y</sub>),
or z<sub>f</sub>² for f alone; scored at k ≥ 4 with Wilson intervals. The splits reuse 13 views, so
the intervals treat dependent splits as independent and are too narrow.

**Reported covariance.** W against χ²<sub>3</sub> at 1% fires on 72.5% of unchanged splits (95%
68–76%). The covariance is 2.3–2.9× too small for f and c<sub>y</sub>, and 4.6× for the right
camera's c<sub>x</sub>, a gap that does not shrink with more views: each view set carries its own
offset. Inflating by the factor measured on the other camera brings false alarms to 6.5% (10.8% left,
2.1% right) but then a 1% focal change is detected in only 10–12% of splits.

**View-level covariances.** On 8,580 more solves (every leave-one-view-out subset), a sandwich
clustered by view still fires on 36–38% (4–7 clusters are too few), while the jackknife covariance J
fires on 2.5% (11×11 corners) and 1.7% (SB corners) with nothing borrowed. The swap is caught in
30% of splits on 11×11 corners and 75% on SB corners: the corners matter as much as the covariance.

**Reference distribution.** With J the χ²<sub>1</sub> reference for z<sub>f</sub>² is mis-scaled about
3×: the empirical 99th percentile on unchanged splits is 1.7–4.2 where χ²<sub>1</sub> says 6.6. A
small-sample Hotelling F reference is far too strict (0 false alarms in 360, but it keeps only 19–22%
of the χ² test's ±4% detections), and even an oracle threshold on W detects a 2% change in only
5–10% of splits: for three parameters, 4–6 views of this rig carry too little information. For f
alone, a threshold borrowed from the *other* camera's unchanged splits detects ±2% in 28–41% and ±4%
in 78–85% with 6 new views, close to the oracle.

## 6. Which corners are right? A rendered twin of the capture

The localiser alone moves Zhang's focal length by 4.8 px (left) and 7.2 px (right), 0.9–1.3%, while
every fit reports σ ≤ 1.2 px, and the 11×11 window and SB disagree by more than 1 px on 22 (left)
and 30 (right) corners, every one on the grid's outer ring. To say which is right we rendered the 13
real views through a known camera (each side's all-view Zhang fit with k<sub>1</sub> + k<sub>2</sub>)
at the real poses, supersampled 4×4, with blur and noise fitted so the renders' edge width and
noise equal the real images' (edge σ 0.949 / 0.960 px against 0.948 / 0.957 real), then JPEG.

On a board with full-width squares, the renders do not reproduce the ring disagreement (largest
11×11–SB gap 0.19 / 0.36 px), all three localisers find the corners to 0.04–0.06 px rms, and every
localiser's Zhang f is within 0.04% of the truth. The cause was in the print: measured outward along
the grid lines, the real board's end squares in grid columns 0 and 8 reach only 0.49–0.53 of the
corner spacing past the last corner, against 0.94–0.97 on the other sides. Re-rendered with
half-width end squares, the 11×11 window misplaces 12–18 ring corners per 13-view set by more than
1 px (up to 9.6 px) and biases f by +0.43% to +1.47% depending on the margin and surround (real
images, 11×11 minus 5×5: +0.64% / +0.91%); SB is biased the other way, −0.32% to −0.43% (real:
−0.12% / −0.39%); the 5×5 window stays within 0.04% of the truth. Our best estimates of the focal
lengths are therefore Zhang on 5×5 corners, 532.9 px (left) and 536.2 px (right).

## 7. The update test on unbiased corners

Re-solving every view set of Section 5 on 5×5 corners (4,290 solves; this environment reproduced
the stored 11×11 and SB solutions exactly):

| | 11×11 | SB | 5×5 |
|---|---|---|---|
| sd of (f<sub>new</sub> − f<sub>old</sub>)/f, unchanged, k = 6 | 1.02% | 0.86% | 0.59% |
| f alone, sibling threshold: ±2% detected, k = 6 | 34.2% | 35.4% | 61.3% |
| W, χ²<sub>3</sub>, J: real unit swap detected, k ≥ 4 | 30.3% | 74.7% | 79.4% |

W against χ²<sub>3</sub> with J stays quiet (1.7% false alarms pooled). With 6 new views the f-alone
test catches a 1% focal change in 18–28% of splits (4–12% before) and 4% in 97–98%. But the sibling's
threshold no longer travels: false alarms are 11.1% on the left camera and 0.0% on the right, because
the jackknife now overstates the spread by different factors on the two cameras (the cameras' own
99th percentiles of z<sub>f</sub>² are 3.56 and 1.03).

Can a unit set its own threshold from the views it already has? Splitting each old set of 7 views
into 4 + 3 in all 35 ways and scaling the halves' focal-length spread by 1/n (3,168 more solves, so
every 3- and 4-view subset is solved) gives a test that is quiet (0.6% / 0.0% false alarms) but deaf:
it catches a ±2% change in 0.8% of splits. The halves overstate the real old-to-new spread 2.9× and
5.2× (predicted sd 1.94% / 2.62% against a real 0.67% / 0.50%). The reason is that f's spread does
not shrink as 1/n below 5 views: per view, after removing the views a subset shares with the
all-view set, it is 3.29% / 5.21% at 3 views, 2.15% / 2.17% at 4 and 1.55% / 0.95% at 7 (5×5
corners, left / right). A per-unit scale needs halves of at least 5 views, so about 10 views in the
old calibration.

**Every split, and a robust jackknife.** Because every subset is now solved, every disjoint split can
be scored, not 60 per k: 1,716 per camera with an old set of 7 and a new set of 6 views, 37,752 per
camera over k = 4–6. Our code reproduces the table's 61.3% exactly on the original 60 splits with the
original thresholds (61.25%). On every split, the borrowed-threshold test catches ±2% at k = 6 in only
43.3% (left 56–61%, right 26–30%), with 4.4% false alarms on the left camera instead of 11.1%. The
splits were representative; the thresholds were not: re-estimated on every split, the two cameras'
99th percentiles of z<sub>f</sub>² are 4.62 and 2.02, not 3.56 and 1.03 (with the old thresholds on
every split, 57.8% and 10.4%). Section 4's set-size result suggests a fix that borrows nothing. If the
jackknife's excess comes from a few near-critical delete-one solves, a robust jackknife, with
1.4826 × the MAD of the delete-one focal lengths in place of their standard deviation, should be closer
to the real spread. It is closer but not honest: at k = 6 the real spread is 0.88× (left) and 0.48×
(right) of its prediction (plain jackknife: 0.57× and 0.31×). Against a plain χ²<sub>1</sub> at 1%,
though, it gives the best test we have found:

| f alone, 5×5 corners, every split (k = 6 unless stated) | J, χ²<sub>1</sub> | J, sibling's threshold | robust J, χ²<sub>1</sub> |
|---|---|---|---|
| ±2% detected (pooled) | 17.7% | 43.3% | 53.8% |
| ±2% detected, k = 5 | 8.9% | 27.7% | 32.0% |
| false alarms, k = 4–6 (pooled) | 0.3% | 2.4% | 2.3% |
| false alarms, k = 4–6, left / right | | 4.4% / 0.3% | 3.4% / 1.2% |

It needs nothing from another unit, is even across the two cameras (±2%: 50% left, 54–61% right), and
catches ±4% in 92.7–94.1% of splits. It does not escape the set-size limit: with 4 new views every
variant catches ±2% in 13% of splits at most, and a larger old set (9 views) does not help.

**Is χ²<sub>1</sub> the right reference for the robust jackknife?** No, and the table's 54% is not the
power of a 1% test. A MAD of 6 or 7 delete-one values is itself noisy, so z² under R has a heavier tail
than χ²<sub>1</sub>. If each view adds an independent offset to f (the model behind Section 4's
reference), z² is scale-free and its distribution depends only on the two set sizes, so a robot can
compute its reference by Monte Carlo with nothing borrowed. Its 99th percentile is 18.45 at 7 + 6 views
(25.84 at 7 + 4), not 6.63, and against χ²<sub>1</sub> the model fires on 6.1% of unchanged updates
(8.5% at 7 + 4). On the real views R against χ²<sub>1</sub> fired less (3.1% / 0.2% at k = 6) only
because R still overstates the real spread at these sizes. The two errors cancel here, and nothing
guarantees they cancel on a unit with more views: under the model, χ²<sub>1</sub> still gives
3.8% false alarms at 10 + 10 views and 2.2% at 20 + 20. Against the model reference (pre-registered,
milestone 4h):

| f alone, 5×5 corners, every split, k = 6 | robust J, χ²<sub>1</sub> | robust J, model reference | J, model reference |
|---|---|---|---|
| ±2% detected (pooled) | 53.8% | 18.6% | 8.6% |
| ±4% detected (per camera and sign) | 92.2–94.3% | 66.4–75.1% | |
| false alarms, k = 4–6, left / right | 3.4% / 1.2% | 0.45% / 0.20% | |

The robust scale doubles the power of the plain one against this model reference, and the gap between
19% and the borrowed threshold's 43% looked like the cost of borrowing nothing at 6 new views on this
rig.

**A reference that knows the geometry.** Most of that gap is the model, not the information. The
independent-offset model ignores what milestone 4f found: the delete-one solves of a small set sit near
the critical configuration and swing far, which inflates the jackknife in a way that depends on which
views are in the set. The unit's own 13-view solve already describes that geometry. For any view subset
S, its first-order change in f under a pixel perturbation ε is g<sub>S</sub>·ε, with
g<sub>S</sub> = J<sub>S</sub>(J<sub>S</sub><sup>T</sup>J<sub>S</sub>)<sup>−1</sup>e<sub>f</sub> from the
subset problem's Jacobian at the 13-view solution (f is gauge-invariant, so the subset's gauge does not
matter). One matrix product then draws every set's f and delete-one f's, and so z², for each
(old, new) split; we feed it the unit's own 13 residual patterns, reassigned to views at random with
random signs. On 9,600 cold-start nonlinear solves of synthetic corners from this twin, the linear
prediction's spread matches the solver's to within 0.2% for 4 to 7 views (it fails for some 3-view
sets). The twin reproduces most of the real jackknife's overstatement from geometry alone (R's
predicted-to-real ratio 0.75 / 0.76 at 7 + 6, against 0.88 / 0.48 measured), and its 99th percentile of
z<sub>R</sub>² is 10.93 / 12.49 at 7 + 6 (median over splits), not 18.45. Against it (pre-registered,
milestone 4i):

| f alone, 5×5 corners, every split, k = 6 | robust J, model reference | robust J, twin per split | J, twin per split | robust J, twin per design |
|---|---|---|---|---|
| ±2% detected (pooled) | 18.6% | 33.1% | 34.7% | 30.8% |
| ±4% detected (per camera and sign) | 66.4–75.1% | 81.2–84.7% | | |
| false alarms, k = 4–6, left / right | 0.45% / 0.20% | 1.44% / 0.37% | 1.59% / 0.35% | 1.60% / 0.66% |

The right camera stays below nominal because its jackknife overstates the real spread about 1.6× more
than its twin predicts, the same excess the independent-offset model missed there (Section 4). Two
things change. With a reference that knows the geometry, the MAD no longer buys power (the plain
jackknife does as well), and one threshold per design does almost as well as one per split: the
per-split thresholds vary 1.65–1.67× from the 10th to the 90th percentile but barely track the real
statistics (Spearman 0.24 / 0.10). What the twin contributes is the right tail for the design.

## 8. Recommendations

1. **Gate on a view-level jackknife, not the solver's covariance.** The reported covariance and a
   view-clustered sandwich give 36–74% false alarms on an unchanged camera; the jackknife 1.7–2.5%.
2. **Test the focal length on its own, with a view jackknife and a reference drawn from the unit's own
   linearised solve.** The gains of every view subset come from the Jacobians of solves the robot already
   ran; ten thousand draws of the unit's own residual patterns give each design's 99th percentile of z²
   (about 11–13 at 7 + 6 views with the robust jackknife). That test keeps false alarms at 0.4–1.4% and
   catches a 2% change from 6 views in 33% of splits, with nothing borrowed; the plain jackknife against
   its own twin reference does as well (34.7%). The independent-offset reference (18.45 at 7 + 6 views)
   is safe but catches 19%. Against χ²<sub>1</sub> the robust test catches 54% at 2.3% here, but that is
   an approximately 2–6% test, not a 1% one, and its rate should be checked on each unit. The
   three-parameter test is information-limited at 4–6 views. Keep W for principal-point moves (the swap lives in
   c<sub>x</sub>).
3. **Check the corners before the statistics.** On a board with cut-short end squares, size the
   sub-pixel window below the shortest end square (here 5×5) or print full end squares with a margin
   of at least one window. The tutorial 11×11 window on this board is worth more focal-length error
   (+0.6–0.9%) than the self-calibration itself (0.15–0.24%).
4. **Do not borrow one sibling's threshold.** A 99th percentile from 180 statistics moved the
   borrowed test from 61% power and 11% false alarms on a sample to 43% and 4.4% on every split. A
   tail from 4 + 3 split-halves of a 7-view old set is not enough either: it overstates the spread 3–5×.
5. **Collect at least 6 new views before testing, and about 10 before trusting a jackknife σ.** Below
   6 views the solver's σ is 4–6× too small and the jackknife's 2–8× too large.

## 9. Limitations

One stereo rig, one board, one tutorial image set; 13 views per camera, so the splits reuse views
and the intervals are too narrow, and a 99th percentile from 180 statistics rests on about two of
them (Section 7 shows how far that moved one result). Scoring every split removes the sampling of
splits, not the reuse of views: it says nothing about a fresh set of views. The focal and principal-point changes are exact model transforms; the swap is the only real
change. The corners are checkerboard corners without mismatches; natural features (SIFT) are not yet
tested. The renders leave out the bend, the clipboard and background clutter, vignetting and the
sensor's own noise. Several findings (the half-width cause, the f-alone power figures in Section 5)
were found after a pre-registered prediction failed and are labelled so in the log.

## 10. What a submission still needs

- A second camera and board captured for this purpose (programme milestone 6, an owner step): a
  physically changed lens (zoom or refocus) for a real focal change, and enough views per unit to
  estimate each unit's own tail on views the test never touches.
- Natural-feature correspondences (milestone 3b) on an openly licensed multi-view set with a target
  calibration of the same camera.
- The twin reference (Section 7) pre-registered on a second unit's views, to see whether it stays at or
  below nominal there; and a twin that models the right camera's extra spread (a per-view offset term
  fitted to the unit's own jackknife) to bring that camera up to 1%.
- The robust-jackknife test (Section 7) pre-registered on a second unit's views, with both references:
  the model reference to confirm it stays conservative, and χ²<sub>1</sub> to see whether its 2–3%
  false alarms survive a unit with more views, where the model says they should rise. Every split of
  these 13 views is already scored.
- The citations checked against their DOIs, and the draft cut to 8 pages.

## Reproducibility

Code, images and every stored solve are in this directory (MIT; the images are OpenCV's,
Apache-2.0). `../README.md`, "Reproduce", lists the commands; the per-milestone pre-registrations
and results are in `../LOG.md`.

Written with AI assistance (Claude Code). No affiliation with any lab named here is implied.
