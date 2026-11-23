# Can a field camera trust its own self-calibration? Covariance, corner bias and an update test on real images

*First full draft (milestone 7 of the `sensing-selfcal` programme), 2026-11-13; revised the same day
with milestones 4e–4g (set size, every disjoint split, a robust jackknife) and on 2026-11-14 with
milestone 4h (a reference for the robust jackknife derived from a model) and milestone 4i (a reference
from the unit's own linearised bundle adjustment), and on 2026-11-19 with milestones 3g–3t (what a short
natural-feature window's focal length compensates, a causal prior and pooling; Section 4), and on 2026-11-21
with milestones 3u–3x (a history floor on the pool's &tau;, a stale held value, and the rule for updating it;
Section 4 and Recommendation 8). Target venue: IEEE
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
lifts detection to 33% at 0.4–1.4% false alarms. On two further cameras (a Kinect and an Xtion from the
TUM RGB-D benchmark), the same reference with nothing tuned stays at 0.06–0.80% false alarms with 5–6 new
views but over-alarms at 4 (3.3–4.7%), and its power there is 10%, not 33%; a tail
threshold borrowed from the sibling camera, which looked better on a 60-split sample (61%),
reaches 43% on every split. The jackknife's
overstatement is a small-set effect (7–8× at 4 views, 1.1–1.4× at 10), while the solver's own σ is
2–6× too small at every size. The practical message for fleet perception is two-sided: a view-level
jackknife makes in-field self-calibration safe to gate, and the corner localiser, not the solver,
decides whether the gate can see a 1–2% change. On hand-held natural-feature video of the TUM cameras, a
rolling-shutter term cuts a 1.2 s window's focal error by a third to a half, a prior on k<sub>1</sub> from the
camera's own earlier windows cuts what is left (2.88% to 2.32%), and five such windows pooled by random effects
reach 1.17% with a nearly honest bar. Flooring the pool's between-window spread at the camera's own past
scatter makes that bar honest, but too wide for a 2-sd change test to see a stale focal length below about
8.5%; the rule that serves a robot is asymmetric, "adopt the pool unless it lies within half its sd of the held
value", and it is chosen the same way when one sequence is left out. Scored by where rays land inside 250 px, it
should move f and keep a target-calibrated distortion: adopting the windows' distortion too gains nothing even when
the held distortion is off by 50%.

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

**Natural features (milestone 3b, pre-registered).** Every result above uses a board's corners. On ordinary
hand-held video with SIFT tracks (Lowe 2004) instead (three TUM RGB-D sequences, two cameras, 57 counted windows of 12
keyframes over 1.2 s, soft-L1 loss, k<sub>1</sub> + k<sub>2</sub>), the solver's σ is far less honest: rms z
against the board calibration is 9.31, and the scatter of f across windows is 4.20, 8.38 and 11.74 times the
median σ (desk sweep, translation along three axes, sideways pass), so the gap is not the reference's. A single
window's f is off by a median 2.80% on the desk sweep and 7.24% on the sideways pass, and the σ hardly reacts to
near-critical, translation-only motion (1.28× the desk's). The median of a sequence's windows is within 1.5% of
the board calibration on all three. Natural features turn the 2× of board corners into 4–12×, so a field robot
should take its uncertainty from the scatter of many short solves, not from one solve's covariance.

**An honest bar for natural features, and what does not fix the bias (milestones 3c–3f, pre-registered).** A
delete-one-keyframe jackknife (12 warm-started re-solves per window) brings rms z from 9.31 to 1.76 over the 57
windows, while a sandwich clustered by track does not (6.63), so the missing error enters per keyframe, not per track.
The honest bar is wide: a median 6.45% of f for one 1.2 s window. Pooling windows by DerSimonian&ndash;Laird random
effects (DerSimonian and Laird 1986) keeps it honest (rms z 1.10 over five-window blocks), whereas treating windows as
independent overstates precision (2.79) and grows worse with every window added; about eight windows (10 s of
hand-held video) reach a 2.5% sd. Two candidate fixes for the bias that remains failed their predictions. The swing of
the optical axis, which the solved poses read as well as motion capture does, does not predict a window's error
(Spearman +0.08). And although a window's k<sub>1</sub> tracks its focal error (Spearman +0.59), conditioning f on the
board's k<sub>1</sub> with k<sub>2</sub> free raises the median error from 5.25% to 7.01%: the windows draw nearly the board's
distortion curve over the inner image but split it differently between k<sub>1</sub> and k<sub>2</sub>. Pinning both terms,
from the full covariances the solves stored, is worse still: the median error rises to 8.72% and the conditional bar
narrows by about 40%, so pooled windows become confidently wrong (rms z 3.07). At first order a past board calibration's
distortion is not a usable prior for a 1.2 s window, and the re-solve below confirms it.

**What a short window's focal length compensates (milestones 3g–3q, pre-registered).** Re-solved on the TUM
images instead of at first order, pinning the board's distortion makes a window's focal error worse still: the
median rises from 5.25% to 10.5%, with f above the board's in 52 of 53 windows, and pinning the board's principal
point instead raises it to 5.87% (milestone 3j). The static intrinsics are not what the free f compensates. The
camera's rolling shutter is part of it. In synthetic windows with hand-held rates of 0.3 rad/s per axis and a 1/30 s
readout, an unmodelled shutter shifts f by a median 4.2%, with a sign set by the window's geometry, so the window's
mean rotation rate does not predict the shift (R<sup>2</sup> 0.03; milestone 3k). Given the gyro, a shutter term
with the readout left free cuts that shift from 4.17% to 1.14% (milestone 3l; shutter models after Karpenko et al.
2011, Hedborg et al. 2012 and Oth et al. 2013), and of the ways a camera&ndash;IMU rig is wrong only the product of
gyro scale and readout matters, which a free readout absorbs exactly; a 10° misalignment costs 0.42% and a 10 ms
offset 0.35% (milestone 3m). On the real video, TUM's motion-capture rates in the window solve find a readout on
both cameras (Kinect readout 27.6 ms, Xtion 25.9 ms; positive in all 54 windows, near zero with rates from the
wrong time) and cut the median focal error from 2.87% to 1.88% (fr1/desk), 5.00% to 3.96% (fr1/xyz) and 7.56% to
3.63% (fr3), as Kerl et al. (2015) would lead one to expect of Kinect-class sensors (milestone 3n). The
motion-capture velocity and a free mocap&ndash;camera time offset (a median 5.1 ms) leave f where it was
(milestones 3o&ndash;3p). What is left is scatter between windows, not bias (milestone 3q): per sequence the robust
sd of the focal error is 2.1&ndash;6.0% against a median of 0.07&ndash;2.5%, a window's signed error tracks its own
k<sub>1</sub> (Spearman +0.58 on the Kinect) and its principal point (+0.42) along a flat f&ndash;k<sub>1</sub>&ndash;principal-point
ridge, and the solver's sd barely flags the bad windows (+0.29). The Kinect windows' median sits inside the 1.6% by
which three honest calibrations of that camera disagree; the Xtion's sits 1.3&ndash;2.5% high against all three.

**A causal prior, then pooling (milestones 3r–3t, pre-registered).** Scatter along a ridge is what a prior is for.
A soft Gaussian prior on k<sub>1</sub> and the principal point at the median and robust sd of the camera's other
windows lowers the pooled median focal error from 3.06% to 2.43% over 53 windows (paired Wilcoxon p = 0.0018); the
k<sub>1</sub> part does the work (milestone 3r). A robot has only its past, so milestone 3s built the prior from the
camera's earlier windows alone, in recording order, starting once five exist. On the 43 windows that have one, the
pooled median error falls from 2.88% to 2.32% (lower in 30 of 43, Wilcoxon p = 0.0006), the window-to-window robust
sd falls to 0.49&ndash;0.72× its value in each sequence, and the image cost rises a median 0.07%: the images barely notice the prior.
The causal prior keeps about two thirds of the leave-one-out prior's gain (2.32% against 2.07%). Updating the
memory from the prior-steadied estimates themselves shrinks the k<sub>1</sub> prior to a near-pin within about ten
windows (its width at the last window is 0.12× the raw-memory prior's on the Kinect, 0.02× on the Xtion); here
the pin landed near the camera's median and cost little (2.42%), but a pin learned from five windows carries the same risk
as pinning the board's distortion did above. The prior removes scatter, not bias: the Xtion's +2.8% stays. Pooling
then averages what scatter is left (milestone 3t). Over blocks of five consecutive windows (6 s of video),
DerSimonian&ndash;Laird random effects on windows with the causal prior give a pooled median error of 1.17% against
2.20% without it, and reach 2% at five windows where the windows without the prior need eight. The random-effects
bar stays about as honest with the prior as without (rms z 1.58 against 1.65), while inverse-variance pooling on
the solver's sd is badly overconfident (rms z 14.7). The cost of the prior shows only in short pools: three
prior-steadied windows that agree get &tau; = 0, fall back on the solver's sd and can miss by 11 sd (rms z 2.67).
The Hartung&ndash;Knapp&ndash;Sidik&ndash;Jonkman variance (IntHout et al. 2014) is slightly more honest at five
windows (rms z 1.51) but blows up at three (20.2), and its modified form (Röver et al. 2015) does no better than
DerSimonian&ndash;Laird there; adding 1% of f in quadrature to each pooled sd, about half the references' own
disagreement, brings the five-window rms z to 0.93.

**From an honest bar to an update rule (milestones 3u–3x, pre-registered).** The short-pool failure is a
small-sample &tau; problem, and the robot already holds the fix: how much its own earlier windows scattered.
Flooring &tau;<sup>2</sup> at the robust variance of the camera's past focal estimates minus the median solver
variance makes three-window pools honest (rms z 2.67 &rarr; 1.09, worst block 11.0 &rarr; 3.2 sd), costs nothing in
accuracy (the five-window median error is 1.17% either way), beats the fixed 1%-of-f floor (rms z 1.33), is
slightly conservative at five windows (0.87), and gives a single 1.2 s window a bar honest to within a factor of two
(rms z 10.1 &rarr; 1.84) (milestone 3u). An honest bar is a wide one. Milestone 3v shifted the held focal length by
&delta; from the board's and tested it against the five-window floored pool with a symmetric 2-sd change test: false
alarms are rare (0.03), but 80% power needs a staleness of 8.5% (10% at three windows, 7% at eight), and keeping a
stale value leaves a worst median error of 4.5% where always adopting the pool leaves 1.17%. The test's one virtue is
on the other side: with a right held value it refuses the outlier pools that always-adopt takes (95th-percentile
error 1.69% against 2.93% at &delta; = 1%). Milestone 3w therefore scored eight update rules by their worst regret over
&delta; &isin; &plusmn;{0, 0.5, &hellip;, 10}%, regret being a rule's median error minus the better of never and always
adopting at that &delta;. At five windows the minimax rule is to adopt the pool unless it lies within half its own sd
of the held value: worst regret 0.42 points, against always-adopt's 1.17 and the 2-sd gate's 3.33, and the same rule
is minimax against all three references. With one to three windows a positive-part empirical-Bayes blend is safer
(three windows: 0.82 against always-adopt's 2.10). Both winners were picked on the blocks they were scored on, so
milestone 3x chose the rule with one sequence left out at a time. Every five-window fold picks the half-sd gate,
including the fold that picks it on the Kinect alone and scores it on the Xtion (worst regret 0.55 against
always-adopt's 1.38); the pooled out-of-sample worst regret is again 0.42, by construction once every fold agrees.
Per sequence the margin is thin: the gate ties always-adopt on fr1/desk (1.32), loses slightly on fr1/xyz (0.80
against 0.73), and on fr1/desk the 2-sd gate does better (1.09). Against TUM's and the target-free references the
five-window folds do not agree on a rule, so the positive recommendation carries its reference with it. The firm
result is the negative one: out of sample, the symmetric 2-sd change test is beaten in 36 of 36 model &times; window
count &times; reference cells.

**Beyond the focal length: the principal point, the distortion and where rays land (milestones 3y&ndash;3zb,
pre-registered).** The same eight rules, on the same blocks, with a pool whose bar comes from scatter alone (the
saved solves carry a solver sd for f only), keep the f answer (gate(0.5) is minimax, worst regret 0.38 points) and
carry it over to c<sub>y</sub> (gate(0.5) minimax, worst regret 2.04 px), whose pools sit within 1.3 px of the board.
They do not carry it over to c<sub>x</sub> or the distortion. For c<sub>x</sub> the minimax rule is never to adopt
(2.86 px against always-adopt's 7.14): the Xtion's pools sit 16.8 px from the board, and the three references
disagree among themselves by 12 px. For the radial displacement 200 px from the centre, D<sub>200</sub>, never is
again minimax (0.92 px against 1.08), because every sequence on both cameras puts it 0.6&ndash;1.7 px below every
reference (milestone 3y). A robot does not use D<sub>200</sub>, though: it uses where a ray lands. Scored as the
projected radius P(r) against a reference, the Kinect's windows put a ray within 1 px of the board out to 250 px at
the median, because their longer f and smaller distortion cancel; on the Xtion the rays land 2.4&ndash;2.8% too far
out, a focal-length error, not a distortion one (milestone 3z). The cancellation is a median property only: across
windows f and D<sub>200</sub> do not trade (Spearman +0.28), and the solver's own covariance is about nine times too
narrow at every radius (rms z of P(200) 9.4, of D<sub>200</sub> 10.8), so the history floor stays necessary. The
board's fr1 model (k<sub>2</sub> &lt; 0) folds back at 381 px, inside the image corner, so a two-term reference must
be checked for monotonicity before it is used near the edge; the P(r) scores stop at 250 px for that reason.
Milestone 3za then asked whether a robot that adopts its windows' f should adopt their distortion with it, scoring
five rules by rms P over 50&ndash;250 px. Adopting f alone behind the half-sd gate stays minimax (worst regret
0.48 px, against 0.63 for the joint gate and 14.24 for never), but adopting both always gives 2.09 px at zero
staleness against 1.94 for f alone, the winner flips by sequence (f-only minus joint at zero staleness: +0.76 px on
fr1/desk, &minus;0.85 on fr1/xyz) and across the 36 model &times; window count &times; reference cells a joint rule is
minimax in 23. The choice between the two is worth under about 1 px; whether to update f at all is worth about
14 px at 10% staleness, and adopting the windows' model beats keeping a held f stale by 1.5% or more. Last, milestone 3zb asked
whether a held distortion that is itself wrong changes this, using another real calibration of the same camera as
the held distortion and a sweep of the board's k<sub>1</sub>, k<sub>2</sub> scaled by up to &plusmn;50%. Inside
250 px the held distortion from another reference, with the right f, leaves 0.21&ndash;0.46 px rms, and even a 50%
error leaves 1.51 px, less than the 2.09 px left by adopting the windows' f and distortion together; on the sweep the
joint gate beats the f-only gate at one grid point (&epsilon; = &minus;30%). The f-only gate's worst regret with
the TUM distortion held against the board as truth is 0.57 px (0.48 with the board's own). A second gate on
D<sub>200</sub> is not usable as specified: the windows' low bias makes it fire in 30 of 31 blocks even when the
held distortion is the truth, and its worst regret is then 1.02 px against the f-only gate's 0.48. Which of the joint and f-only
gates wins depends on which reference is called the truth, not on which distortion is held. One of the five
3zb predictions held, as did three of seven in 3y, three of seven in 3z and one of six in 3za.

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

**Two more units (milestone 4j, pre-registered).** Every number above comes from one stereo rig. The
TUM RGB-D benchmark (Sturm et al. 2012) publishes a checkerboard sequence for each of its cameras with the authors' own
calibration; we took the Kinect (fr1) and the Xtion (fr3), picked 13 views of each by a rule fixed
before any solve (full 8×6 detections with corners at least 15 px apart, the most foreshortened of the
sharper half of each of 13 blocks in time), solved every subset of 3–7 views with the same solver, and
ran milestones 4g and 4i's code unchanged. The Xtion's 13-view f is within 0.64% of TUM's; the Kinect's
is 1.85% high, because its lens needs more than k<sub>1</sub>. Against each split's twin threshold the
robust test fires on 0.80% / 0.76% (fr1) and 0.62% / 0.06% (fr3) of unchanged updates at 5 / 6 new views,
but on 3.27% and 4.73% at 4, where every delete-one set has 3 views: the linearisation breaks there and
the real solves fail most often (12 and 49 of 286 three-view sets did not converge). A 2% change from 6
views is caught in 10.0% of splits. These units fix f less precisely (robust spread over 6-view sets
0.73% / 0.51% of f, against 0.51% / 0.30% on OpenCV's cameras), and the cold-start solver lands more than
5% away on 8 and 30 of their 1,716 six-view sets, against none here; on the Kinect it also leaves the
linear regime at 7 views on synthetic corners. The units' focal lengths differ by 1.40%, and the old-from-
the-other-unit test fires on 6.3% / 7.9% of splits, between its ±1% (2.0%) and ±2% (10.0%) rates on
scaled focal lengths: a real change behaves like a scaled one of the same size. Four of five predictions
failed (only the anchor held), and they failed in a useful direction: the false-alarm rate transfers at
5–6 new views, the power does not.

**The far solves are the data (milestone 4k, pre-registered).** We re-ran all 11,442 TUM subset solves
from the fleet's spec focal length (527.1 px, the mean of TUM's two published values) instead of 1.3× the
Zhang estimate, expecting the far minima to vanish and the power to recover. All five predictions failed.
Every one of the 38 far 6-view solves came back at the same focal length, and on the Xtion they fit their
corners as well as the 13-view solve (median rms 0.071 px against 0.075 px): those view sets leave f
nearly free. On the Kinect the spec start was worse: its 13-view solve stopped at f 508.88 px with rms
0.483 px, and the cold start reached a lower cost on 89 of the 6-view sets and the warm start on none. A
basin check that drops any solve more than 10% from the spec raised the false alarms at 4 new views to
4.36% and 20.09% (fr1 / fr3), because it removes the wide delete-one values that the robust jackknife
needs when a set is near-degenerate; the power at ±2% stayed at 10.6%. The TUM cameras' lower power is a
property of their views, not of the solver.

**Which updates can see a change (milestone 4l, pre-registered).** The twin that gives each split its
threshold also gives its power: the same draws, scaled to the unit's residual σ with the degrees-of-freedom
correction and with a focal change added to the new set, say how often the test would fire. Scored
against the real detections at ±2% and 7 + 6 views, this predicted power ranks the splits with AUC 0.659,
0.693, 0.749 and 0.748 (OpenCV left and right, TUM fr1 and fr3). Testing only the quarter of splits it
rates highest lifts the TUM cameras' detection from 10.0% to 21.5% (OpenCV's: about 33% to 48.3% and
50.0%) at 0.70%, 0.00%, 2.35% and 0.00% false alarms, and every split holding one of the far solves falls
in the quarter it rates lowest. The twin's sd of f<sub>new</sub> − f<sub>old</sub> alone ranks as well
(AUC 0.660–0.752). The level is not right: the twin's mean power is 1.19–1.89× the real rate, and at 4 new
views the ranking fails on the Kinect (AUC 0.42). A unit can therefore use its twin to choose when to test,
not to promise a detection rate.

**Waiting for better views (milestone 4m, pre-registered).** Choosing a split chooses its old set too,
which a robot cannot do. Holding each old set fixed and letting the twin pick among the disjoint candidate
new sets, its pick catches ±2% in 9.7% of old sets on the TUM cameras against 7.3% for a blind pick
(×1.33, 7 candidates at 6 + 6) and ×1.63 among 28 candidates (5 + 6); on OpenCV's cameras ×1.17. The
chosen splits' false alarms stay at 0.06–1.40%. The twin's predicted gain matches the real one within
0.11 on 7 of 8 unit-designs, though its level is high, and the sd rule does as well. Some candidate would
have caught the change in 19.2–55.1% of old sets, so most of what makes one new set luckier than another
is not foreseeable from the twin.

**Fitting the lens the camera has (milestone 4n, pre-registered).** Every TUM result above fits k<sub>1</sub>
alone, which the Kinect's lens (TUM's d<sub>1</sub> = −0.95) does not follow. Re-solving the 5-, 6- and 7-view
sets with k<sub>1</sub> + k<sub>2</sub> and re-scoring every 7 + 6 split with a k<sub>1</sub> + k<sub>2</sub> twin
(same draws, solver and start) raised the pooled ±2% detection from 10.0% to 14.8%, all of it on the
Kinect (fr1: 21.9% and 16.6% at −2% and +2%, against 11.0% and 8.6%), with its false alarms at 0.59% (k<sub>1</sub>:
0.76%). The Kinect's 6-view focal lengths scatter less (robust spread ×0.81), and a real unit swap is
caught in 16.3% and 17.0% of splits, against 6.3% and 7.9%. On the Xtion, whose images arrive
undistorted, the second term changed nothing measurable (spread ×0.97). We had predicted the opposite, a
precision cost and lower power. The unmodelled distortion was not inert: each view set absorbed a different
share of it into f. The Kinect's target-free f stays +1.60% above TUM's with k<sub>2</sub>, while flat-board
Zhang on the same corners falls to +0.09% once k<sub>2</sub> and k<sub>3</sub> are fitted, so the remaining bias
belongs to the free board points, not to the lens order.

**Fitting the lens, then waiting (milestone 4o, pre-registered).** With the k<sub>1</sub> + k<sub>2</sub> twin, milestone
4l's ranking and milestone 4m's waiting rule were re-run on the stored solves (7 + 6 and 6 + 6; same draws).
On the Kinect the twin's predicted power now matches the real ±2% rate (mean π over real 0.995, against
1.34 with k<sub>1</sub>), it ranks splits slightly better (AUC 0.775 against 0.749), and the top quarter it
rates highest catches 38.9% (k<sub>1</sub>: 20.3%). With the old set held fixed, its pick among 7 candidate new
sets catches ±2% in 15.2% of old sets on the TUM units against 11.3% blind (×1.35), so the two gains multiply:
on the Kinect, 6.2% blind with k<sub>1</sub> becomes 17.9% chosen with k<sub>1</sub> + k<sub>2</sub>, at 0.59% false
alarms. On the Xtion the twin still overstates its power 1.96×, so an unmodelled lens term is one source of
the twin's optimism, not the only one.

**On views the test has never seen (milestone 4p, pre-registered).** Every figure above scores splits of one
pool of 13 views. A second, disjoint pool of 13 was picked from each TUM sequence by the same rule (each
frame at least 1 s from the first pool's), solved with k<sub>1</sub> + k<sub>2</sub> (9,440 solves), and the 7 + 6 test
scored with the old set from one pool and the new set from the other, in both directions, against the
per-split threshold of the two pools' twins. False alarms stay under the 2.5% bar (0.91% on the Kinect,
1.90% on the Xtion) but not at nominal (1.40% pooled), against 0.59% and 0.12% in-sample, and ±2% is caught
in 7.96% of splits against 14.76% in-sample. The second pool is flatter (median tilt 0.147 against 0.268 and
0.063 against 0.101), its 6-view solves scatter twice as much (1.23% of f against 0.59% and 0.50%), and
within it alone the Xtion's false alarms reach 4.44%; the across-pool power lies between the two pools' own
(14.8% and 5.7%). The two 13-view calibrations agree to +0.17% and +0.58%, 0.98 and 2.71 of the twins' sd
taken as iid noise; with the twins' own residual-pattern sd (std over their draws) the gaps are 0.29 and 1.59
(milestone 4r), so the two calibrations are consistent.
The in-sample false-alarm rates of this section are therefore lower bounds, and the test's safety depends on
the geometry of the new views as well as on the threshold.

**A per-view error in the twin (milestone 4r, pre-registered).** The twin's noise resamples each view's
residual pattern and so carries no error shared by a whole view. Giving each view its own effective focal
length, f + δf<sub>v</sub> with δf<sub>v</sub> ~ N(0, τ²), and fitting τ per pool so that the twin's robust spread of 6-view f
matches the real one (only the pool's own solves are used) gives τ of 0.75% and 0.22% of f on the tilted
pools and 1.88% and 1.80% on the flat ones. With that twin's per-split threshold every unit and pairing stays
at or below 0.58% false alarms (the flat Xtion pool from 4.44%; 0.37% pooled), but ±2% is caught in 4.07% of
splits against 9.08% (×0.45). A per-view f offset is the most costly shape the missing error could take; the
safe threshold with the least lost power is open.

**A third pool of views (milestone 4s, pre-registered).** A third disjoint 13 views per unit, picked by the same
rule at least 0.5 s from the first two pools' frames, tests the jitter on views that did not suggest it. On the
Xtion every pairing that holds the third pool stays at or below 0.53% false alarms. On the Kinect the third pool
is well tilted, fits a small jitter (0.77% of f), and over-alarms at up to 7.47% (CC); borrowing the other two
pools' mean τ leaves it at 7.18%, and pooled over the ten pairings the rate is 2.60%. That pool's 7-view solves
hold 62 far solutions against one in the first pool, an error the robust 6-view spread the jitter is fitted to does
not register. The three 13-view calibrations of each unit agree within 1.38 of the jittered twin's sd. A per-view
jitter is therefore necessary on flat pools but not sufficient: the threshold must also account for far small-set
solves.

## 8. Recommendations

1. **Gate on a view-level jackknife, not the solver's covariance.** The reported covariance and a
   view-clustered sandwich give 36–74% false alarms on an unchanged camera; the jackknife 1.7–2.5%.
2. **Test the focal length on its own, with a view jackknife and a reference drawn from the unit's own
   linearised solve.** The gains of every view subset come from the Jacobians of solves the robot already
   ran; ten thousand draws of the unit's own residual patterns give each design's 99th percentile of z²
   (about 11–13 at 7 + 6 views with the robust jackknife). That test keeps false alarms at 0.4–1.4% and
   catches a 2% change from 6 views in 33% of splits, with nothing borrowed (on two TUM RGB-D cameras it
   stays at 0.06–0.80% false alarms with 5–6 new views, but power falls to 10%: power is a property of the
   unit); the plain jackknife against
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
   6 views the solver's σ is 4–6× too small and the jackknife's 2–8× too large, and with 4 new views the
   twin reference over-alarms (3.3–4.7% on the TUM cameras). Keep the lowest-cost solve over several
   starts, but never clip f to a window around the spec: far solves of near-degenerate sets are true
   minima, and dropping them pushed false alarms at 4 new views to 20% on one TUM camera.
6. **Let the twin choose when to test.** Rank candidate updates by the twin's predicted sd of the focal
   difference and test the best-conditioned ones: the top quarter doubled the TUM cameras' power at ±2%
   (10.0% to 21.5%) without raising false alarms above 2.35%. Read the twin's power as a ranking only; it
   overstates the real rate 1.2–1.9×.
7. **Self-calibrating from natural features on a rolling-shutter camera: model the shutter, remember k<sub>1</sub>,
   pool five windows.** Put the gyro rates and a free readout in every short window (on the TUM cameras it cuts
   the median focal error by a third to a half), keep a running median and robust spread of k<sub>1</sub> and
   the principal point from the camera's raw window estimates and use them as a soft prior once five exist (not
   from the prior-steadied estimates, which collapse to a pin), and pool at least five windows by random effects,
   never by inverse variance on the solver's sd, with the pooled sd floored at about 1% of f. On TUM that gets f
   to about 1.2% of the board from 6 s of hand-held video, with an error bar that is close to honest. Floor the
   random-effects &tau;<sup>2</sup> at the camera's own past window scatter rather than at a fixed fraction of f.
8. **Updating a held focal length from natural features: adopt unless the pool agrees.** With the floored pool,
   do not test the held value with a symmetric 2-sd change test (on TUM, at three windows, it catches a 5% staleness
   only 46% of the time, and it is beaten in 36 of 36 cells out of sample). From five pooled windows, replace the held value unless the pool lies
   within half its sd of it; below five, move to the pool by the positive-part empirical-Bayes weight. State the
   reference the rule was tuned against: against the board it survives leaving a sequence or a camera out, against
   the other two references the choice is not stable.
9. **Self-calibrate f and c<sub>y</sub>; hold c<sub>x</sub> and the distortion, and score by where rays land.** On
   TUM the half-sd gate is minimax for c<sub>y</sub> as for f, while natural-feature windows bias the distortion low
   in every sequence and leave the Xtion's c<sub>x</sub> unsettled, so a robot should keep those from a target
   calibration. Adopting the windows' distortion with their f is worth under about 1 px either way inside 250 px, and a
   held distortion off by 50% still beats it; score updates by the projected radius P(r), not by k<sub>1</sub> or
   D<sub>200</sub>, and check a reference distortion for monotonicity before using it near the image edge.

## 9. Limitations

One stereo rig, one board, one tutorial image set for Sections 3–7; two more units (TUM RGB-D) only for
the update test, each one hand-held sequence of about 50 s; 13 views per camera, so the splits reuse views
and the intervals are too narrow, and a 99th percentile from 180 statistics rests on about two of
them (Section 7 shows how far that moved one result). Scoring every split removes the sampling of
splits, not the reuse of views; a second pool of 13 views per TUM unit (milestone 4p) shows the in-sample false alarms understate the fresh-view rate (1.40% against 0.35%), but both pools come from one session. The focal and principal-point changes are exact model transforms; the swaps (here and between the
two TUM units) are the only real changes. The corners are checkerboard corners without mismatches; natural features (SIFT) are tested only on
short windows of three TUM RGB-D sequences (Section 4). Those windows come from one recording order per camera and one session on the Xtion, the rotation rates come from motion capture rather than an onboard gyro, the Xtion's +2.8% focal bias is unexplained, and milestones 3s–3x re-used saved solves (43 windows; overlapping blocks are not independent tests). Staleness in milestones 3v–3x is a shifted held value, not a real lens change (a refocus would also move k<sub>1</sub> and the principal point), and the leave-one-out check of the update rule has three folds, two of them on one camera. In milestones 3y&ndash;3zb the pools' bars come from scatter alone, P(r) ignores the principal point and tangential terms and stops at 250 px (the board's fr1 model folds at 381 px), the feature radii the windows cover are unmeasured (the TUM frames were unreachable from these sessions), and a "wrong" held distortion is another real calibration or a scaled one, not a measured lens change. The renders leave out the bend, the clipboard and background clutter, vignetting and the
sensor's own noise. Several findings (the half-width cause, the f-alone power figures in Section 5)
were found after a pre-registered prediction failed and are labelled so in the log.

## 10. What a submission still needs

- A second camera and board captured for this purpose (programme milestone 6, an owner step): a
  physically changed lens (zoom or refocus) for a real focal change, and enough views per unit to
  estimate each unit's own tail on views the test never touches.
- Done for natural features on two cameras (milestones 3b–3g, Section 4): σ is 4–12× too small per 1.2 s window,
  a keyframe jackknife makes it honest and random-effects pooling keeps it honest across windows; neither axis swing
  nor a one- or two-coefficient distortion prior explains the remaining bias, first order or re-solved (milestone 3j).
- Done for natural features on two cameras (milestones 3k–3t, Section 4): a rolling-shutter term with mocap rates
  cuts the window's error by a third to a half, what remains is scatter along an f&ndash;k<sub>1</sub> ridge, and a
  causal k<sub>1</sub> prior with five-window random-effects pooling reaches about 1.2%. Still needed: the same
  pipeline on an onboard gyro instead of motion capture, other recording orders (a bad start for the prior), a
  cause for the Xtion's +2.8%, and longer windows with loop closures.
- Done on TUM with a simulated staleness (milestones 3u–3x, Section 4): a history floor makes the pooled bar honest,
  and an asymmetric update rule chosen out of sample beats both always adopting and a 2-sd change test. Still needed:
  a real lens change (a refocus or zoom, the owner-captured set of milestone 6) to score the rule on, more sequences
  per camera so that leaving one out is a real test, and the rule's choice against a reference that is not the board.
- Done on TUM for the other intrinsics (milestones 3y&ndash;3zb, Section 4): the update rule carries to c<sub>y</sub>,
  not to c<sub>x</sub> or the distortion, and scored by P(r) a held distortion beats adopting the windows' even when
  it is off by 50%. Still needed: a bias-corrected D<sub>200</sub> before any distortion gate, the feature radii the
  windows cover, the image edge against a reference that does not fold there, and a real lens change.
- Done for two units (Section 7, TUM RGB-D): the twin reference stays at or below nominal at 5–6 new
  views. Warm-started subset solves do not recover the power (milestone 4k: the far minima are real).
  Choosing view sets by the twin's predicted power works as a ranking (milestone 4l), and with the old set
  held fixed it gains ×1.33–1.63 on the TUM cameras (milestone 4m); fitting k<sub>2</sub> on the Kinect
  doubles its power at 7 + 6 (milestone 4n), and waiting multiplies with it (milestone 4o: 6.2% to 17.9% on the Kinect); still needed: a stopping rule over
  a longer stream of views (more than 13 per unit), and a twin that models the right camera's extra spread (a per-view offset
  term fitted to the unit's own jackknife) to bring that camera up to 1%.
- Done for one session per unit (milestone 4p): a disjoint second pool of views keeps false alarms under 2.5%
  but halves the power and shows the threshold must match the new views' geometry. Still needed: a reference
  that conditions on the new set's own geometry (a twin of the new views, or a tilt gate), checked on a
  third pool, and views from a different session of the same camera.
- The robust-jackknife test (Section 7) pre-registered on a second unit's views, with both references:
  the model reference to confirm it stays conservative, and χ²<sub>1</sub> to see whether its 2–3%
  false alarms survive a unit with more views, where the model says they should rise. Every split of
  these 13 views is already scored.
- The citations checked against their DOIs. A letter-length cut exists ([`ral.md`](ral.md), about 6.2 pages by
  `check_short.py`'s rule of thumb, numbers all copied from this draft); still needed: typeset it in the IEEE class to
  confirm the page count.

## Reproducibility

Code, images and every stored solve are in this directory (MIT; the images are OpenCV's,
Apache-2.0). `../README.md`, "Reproduce", lists the commands; the per-milestone pre-registrations
and results are in `../LOG.md`.

Written with AI assistance (Claude Code). No affiliation with any lab named here is implied.
