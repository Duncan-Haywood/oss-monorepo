# Draft: when does rotor cant pay on a small quadrotor co-designed with its motors and controller?

Status: **milestone 7, first draft (2026-11-14; section VII added 2026-11-19, milestone 7ad's settling paragraph and 7ae's retraining check the same day): outline of every
section, section VI (stability of the side-force feed-forward, milestones 7c–7g) and section VII
(motor-lag randomisation, milestones 7s–7ac) written in full. Not submittable.** Target: *IEEE Robotics and
Automation Letters* (6 pages + 2), fallback ICUAS; an aim, not a claim of acceptance.

Every number in this file is copied from a results file under `../experiments/` or from
[`../LOG.md`](../LOG.md), and nothing here is new. `python3 paper/check_numbers.py` (from the project
directory) checks each quoted figure in sections VI and VII and the abstract against the file named beside it,
and fails if a results file changes under the draft. Everything is simulated; the propeller torque
ratio comes from measured UIUC data, while the mass, cost and motor fits, the plant ranges and the
gust model are inherited assumptions (`../README.md`, "Limitations").

Written with AI assistance (Claude Code).

## Abstract (draft)

Builders cant the motors of small quadrotors a few degrees "for yaw authority" by rule of thumb.
We co-design a four-rotor X's arm, propeller, cant angle and controller gains with CMA-ES in a
randomised simulator whose actuator limits come from the full thrust-bounded allocation, and price
hover power in the objective. Cant pays under every attitude law we tried: paired by seed it beats
no cant by 4.18° (INDI), 4.88° (geometric) and 5.27° (PID) of held-out attitude error, 10 of 10
seeds each, and the optimum is not the small angle folklore suggests but 28–37°, stable across
laws and power prices. The design ranking of the six law × cant arms survives an independent
simulator (RotorPy, arm-level ρ 0.94–1.00). The cost is a side force, sin α/(L cos α − κ sin α)
per unit roll torque, which on a rigid frame hurts position hold on one horizontal axis and helps
the other. A feed-forward from the attitude integrator cancels it, but CMA-ES tunes that loop onto
its linear stability boundary, where it survives only because a 20° tilt-command limit contains
the instability; at PX4's default 45° limit such designs diverge on 13 of 384 held-out flights. An
11-state linear test added as a training constraint at 0.8× the integral-gain ceiling removes
those divergences for about 0.7% of held-out cost. Finally, the motor lag: tuned at an unsourced
15 ms, no design is certified, and nearly every stress flight diverges, at the 33–39 ms two
published identifications give. Retuning shows that
how the lag is randomised in training matters more than its nominal value: drawing plants exactly
across the identified range is the worst choice tested, and anchoring the draw at the slowest
identified lag with a ceiling 3–4× higher cuts the identified-range crashes by four fifths or more
against that draw (486 to 101 or 65 of 2,304), paid in rise time rather than crashes.

## I. Introduction (outline)

1. Yaw is the weakest axis of a quadrotor (reaction torque κ/L ≈ 0.03–0.1 with measured
   propellers); cant converts thrust into yaw torque at a hover-power price cos α^−1.5.
2. Tilted-rotor work studies fully actuated hexa/octorotors or the allocation alone
   [crowther2011, rajappa2015, michieletto2018, hamandi2021]; co-design work fixes or omits the
   controller [du2016, carlone2019]. The joint optimum for the common X quadrotor with the
   controller tuned per design under plant randomisation is open.
3. Contributions: (a) corrected closed-form attainable torques and side force for the canted X
   (milestone 1); (b) the co-designed cant and its price under three attitude laws and two
   simulators (milestones 2, 4, 5); (c) the side force's effect on position hold on a rigid frame
   and a feed-forward that cancels it (milestones 6, 6b, 7, 7b); (d) a linear stability certificate
   for that feed-forward, cheap enough to run inside a tuning loop, with its margin traced
   (milestones 7c–7f); (e) a measured rule for the motor-lag randomisation range when only a
   published identification is known: floor at its slow end, ceiling at 3–4× (milestones 7s–7ac).
   Code and data: MIT, one command per figure.

## II. Related work (outline)

Tilted and fully actuated multirotors [crowther2011, rajappa2015, michieletto2018, hamandi2021,
ryll2015, brescianini2016]; computational co-design [du2016, zhao2020, carlone2019] with CMA-ES
[hansen2001]; attitude laws [lee2010, smeur2016] and learned control [hwangbo2017, kaufmann2023];
allocation [johansen2013]; simulators [folk2023, panerati2021]; propeller data [brandt2011]. For
section VI: robust stability of a plant box checked at its vertices is a sampled test, not a
guarantee, for a multi-parameter family [bartlett1988]; we report it as such. For section VII:
domain and dynamics randomisation [tobin2017, peng2018] and choosing the randomisation range
[mehta2019]; motor identifications [bauersfeld2021, foehn2022].

## III. Model (outline)

Sizing closure, $300 cost cap, UIUC-measured κ; full 6×4 allocation with thrusts in [0, Tmax]
giving yaw 4Δ(L sin α + κ cos α) and roll 4Δ(L cos α − κ sin α)/√2 (milestone 1, checked against a
linear programme to 1e-15); attitude-priority mixer on one thrust polytope (milestone 2); side force
F_y = lat·τ_x, F_x = lat·τ_y, lat = sin α/(L cos α − κ sin α); rigid centre-of-pressure offset with
opposite roll/pitch disturbance signs (milestone 6b); plant randomisation of torque scale, mass and
motor lag; 6 s position-hold episodes with a ±3 m/s wind step at 3 s; composite objective
J = −√((pos/0.10 m)² + (yaw/10°)²) − 0.03·P_hover/100 W.

## IV. Where the optimum is, and whether a better controller removes it (outline; milestones 1, 2, 4)

Table: cant minus no cant, paired by seed, per law (PID 5.27°, INDI 4.18°, geometric 4.88°; 10/10
seeds; `../experiments/m4_controllers/results.txt`). Chosen cant 34–35° median per law; 28–37° in
9 of 10 seed-arms as hover power is priced from 0 to 1° per 100 W (milestone 2). H1 (a small
5–20° optimum) refuted; H4 supported. Figure: `m4_controllers.png`.

## V. Does it survive another simulator? (outline; milestone 5)

RotorPy 3.0.0 with canted-rotor wrench: cant wins 10/10 seeds for every law; all-design ρ 0.80–0.91
against the stylised simulator's own fresh-episode ceiling 0.95–0.97; top-ten ρ is noise-bound
(0.26 for the stylised simulator against itself). The stylised model is 1–2° optimistic, most for
INDI. Figure: `m5_rotorpy.png`.

## VI. Stability of the side-force feed-forward (milestones 7c–7f; full draft)

**Setting.** On a rigid frame the canted rotor's side force pushes the vehicle along the drag on
one horizontal axis (milestone 6b). The steady part of that force is lat times the attitude loop's
counter-torque to the gust, which the attitude integrator already estimates. The integrator
feed-forward subtracts lat·k_i·∫e·τ_max/m from the horizontal acceleration the tilt must produce,
with no new sensor (milestone 7b). Retrained with it, the centre-of-pressure-above designs never
diverge at the trained lever. Bolted onto an existing tune without retraining, the same term
diverges on 84 of 384 held-out flights even with no gust torque.

**A linear certificate.** Around hover the simulator's update of one horizontal axis is linear in
11 states: position, velocity and position integrator; tilt and rate with their one-step-old copies
(the controller reads delayed measurements); the attitude integrator; the delivered torque through
a first-order motor lag; and two feed-forward states. The model is built by stepping the
simulator's own update on unit vectors and agrees with it to 10⁻³ (`tests/test_linstab.py`). The
two axes see the side force with opposite signs, so both must be stable. For a design we define
the *ki ceiling* as the largest multiple of its attitude integral gain for which the spectral
radius stays below 1 at all eight corners of the randomised plant box (torque scale × mass ×
lag). Checking only the corners is a sampled test: for a multi-parameter family, stable vertices
do not guarantee a stable interior [bartlett1988]. In our data no flight the model called stable
at its own drawn plant diverged at the design wind: 0 of 2,688 for the integrator feed-forward
designs (`m7c_stab/results.txt`).

**The test is necessary, not sufficient, and the optimiser lives on its boundary.** Over the 48
design-conditions of milestone 7b, the linear model calls 384 held-out flights unstable; 84
diverge and 300 do not (accuracy 0.902, sensitivity 1.000; `m7c_stab/results.txt`). CMA-ES, left
alone, puts the integral gain at 1.04, 1.00, 1.01, 1.05, 1.11 and 0.88 times its ceiling in the six
seeds (`m7c_stab/results.txt`): on the boundary, with no margin against the plant set. The
bolted-on designs are stable only up to 0.29–0.44 of their own integral gain, so they sit 2.3–3.4×
past the ceiling, with growth rates of 3.91–7.41 per second at the worst held-out plant.

**What holds the false alarms: the tilt-command limit.** Designs rescaled to 1.25× their ceiling are
unstable by the model on 367 of 384 held-out flights and diverge on none. Two explanations were
committed and tested (milestone 7d): the attitude integrator's clip, and the 6 s episode being
shorter than a slow instability (growth 0.50–0.66 per s) needs. Both were refuted. The integrator
never reaches its clip (median share of steps 0.000 in every set), removing it changes no
divergence count, and 18 s flights diverge no more than 6 s ones. The saturation that is active is
the 20° tilt command (on 13–24% of these designs' steps; `m7d_clip/results.txt`). Widening it
releases the instability: at 45°, 166 of 384 six-second flights and 318 of 384 eighteen-second
flights diverge, approaching the 367 the linear model calls unstable (`m7d_clip/diag.txt`). Under the 20°
cap the same designs hold position (median RMS 0.110 m) while oscillating against the limit
(roll/pitch tracking error 8.73° RMS against 3.63° for designs at 0.8× the ceiling).

This matters for deployment because 20° is not a typical setting. PX4's maximum tilt in velocity
and acceleration modes, `MPC_TILTMAX_AIR`, defaults to 45° with a floor of 20° [px4tilt], and
ArduPilot's `ANGLE_MAX` defaults to 30° [ardupilotangle]. At 45°, the designs CMA-ES tuned onto
the ceiling diverge on 13 of 384 held-out flights and their position error rises from 0.105 m to
0.257 m (`m7e_margin/tilt.txt`). A design that looks safe in a simulator with a tight tilt limit
inherits a failure mode at a stock autopilot setting.

**The certificate as a training constraint, and how much margin.** We reject any CMA-ES candidate
whose linear model is unstable at a plant corner at k_i·M, for margins M from 1.0 to 1.67 (the
rejected candidate is not simulated; milestones 7e and 7f, six seeds each, 3,200 evaluations).
The optimiser sits on whatever bound it is given (ceiling multiples 1.26–1.30 at M = 1.25), so the
margin is the design parameter. Table VI-1 gives the held-out result at PX4's default 45° limit
and at twice the trained centre-of-pressure lever, outside training (`m7f_sweep/results.txt`).

| ki bound (× ceiling) | none | 1.0 | 0.9 | 0.8 | 0.7 | 0.6 |
|---|---|---|---|---|---|---|
| diverged of 384, 45°, trained lever | 13 | 9 | 3 | 0 | 0 | 0 |
| diverged of 384, 45°, twice the lever | 45 | 32 | 22 | 12 | 13 | 12 |
| held-out J − unconstrained, 20°, trained lever | 0 | −0.001 | −0.012 | −0.011 | −0.010 | −0.012 |

Robustness has a knee at 0.8× and costs the same from 0.9× down to 0.6×, about 0.011 in J (0.7%)
with position error 0.105 m in every arm: the other gains take up the integral gain's slack.
Requiring only stability at every corner (M = 1.0) removes a third of the 45° divergences, not all
of them. Training stays cheap: 10–15% of candidates are rejected and wall time is no worse than
unconstrained, since a rejected candidate costs one eigenvalue check of an 11×11 matrix at eight
corners instead of a 16-episode rollout.

**What it does not fix.** At twice the trained lever a floor of 12–13 divergences in 384 remains at
every bound from 0.8× down (Table VI-1, second row). No ki margin moves it, so it is not an
integral-gain effect. Milestone 7g traced it to torque authority (`m7g_lever2/results.txt`): every
one of these flights tips past 60° rather than drifting, the gust torque peaks at a median 0.87–0.88
of the plant's torque limit in the dying flights at 45° against 0.50 in the survivors, and an ideal
mixer (no shared thrust polytope) cuts the pooled count of the three margin-trained sets from 37 to
8; with an ideal mixer and twice the torque room none diverges. A frame whose centre of pressure
may sit twice as far from the centre of mass as designed needs thrust headroom, not another tune. In the
centre-of-pressure-below geometry the integrator carries almost no gain (k_i/k_p 0.09–0.24 per s),
the bound does not bind, and the constraint acts only by requiring corner stability.

**For a builder.** Add the linear check to the tuning loop with k_i at 0.8× of its ceiling or a
little below, and score the tune at the tilt limit the vehicle will fly, not at a conservative one.

**Figure plan.** VI-a: k_i/k_p against the linear ceiling for bolted-on, retrained and rescaled
designs (`m7c_stab.png`). VI-b: diverged share against tilt-command limit, 6 s and 18 s
(`m7d_clip.png`). VI-c: the margin sweep, cost and divergence against bound (`m7f_sweep.png`).
Each is regenerated by the `figure.py` beside its results file.

## VII. How wide should the motor-lag randomisation be? (milestones 7s–7ac; full draft)

**Why the lag needs its own section.** Every design above was tuned with a first-order motor lag of
15 ms·(D/0.127 m)^1.5, an inherited law nobody had sourced. The qualitative findings survive any law
in a 4× range of the constant and exponents 0–3 (milestone 7s), but the numbers do not: at a 30 ms
constant, at most 1 of 72 designs passes the margin test of section VI under any exponent
(`m7s_lag/results.txt`). Two published identifications of brushless 5-inch platforms, the class
our designs belong to (0.106–0.134 m propellers), give 33 ms [bauersfeld2021] and 39.1 ms
[foehn2022] (`../data/motor_lag/identified.csv`). At their midpoint none of the lever-aware designs
tuned at the inherited law is certified, and they crash on 374 and 376 of 384 held-out flights
(lever 2, 45°, cap; `m7t_lag_src/verdicts.txt`). Retuned at 36 ms, all are certified and crash on
63 and 82. The error is one-sided: scored back at the inherited law, the 36 ms tunes crash on 8 and
15 flights against the native tunes' 54 and 64. A gain set tuned for a slower actuator than the real
one loses little; one tuned for a faster actuator fails outright.

**The question.** A builder rarely has an identification of their own motors. What they can state is
a range. Like any domain-randomised tuner [tobin2017, peng2018], ours draws a plant lag for each
training episode, here as a nominal value times U(1, 2), so the training interval is the design
choice. Which interval should cover a lag known to lie in 33–39.1 ms? We trained eleven intervals with
the lever-aware objective (milestone 7i: trained on centre-of-pressure levers 0–2) and section VI's
margin constraint at 0.8× the ki ceiling (closure `src_li`, 45° tilt limit,
TWR 2, 3,200 CMA-ES evaluations, 6 seeds × 2 centre-of-pressure geometries each), and scored every
design on the same held-out set (seed 9999, 64 episodes per design and law). Table VII-1 gives the
*identified total*, the flights that diverge at lever 2, 45°, summed over the 33, 36 and 39.1 ms laws
(of 1,152 per geometry); the same count at a 75 ms law, twice as slow as either identification;
and the cost a builder sees in calm air at lever 1, the rise time to 90% of a 1 m position step
and the sized mass. The table is generated from the results files by `paper/check_numbers.py`, and
`paper/table7_stats.py` adds intervals and tests (`table7_stats.txt`).

| training plant lag (ms) | milestone | identified total (above, below; of 1152) | at 75 ms (of 384) | rise, 1 m step (s) | mass (kg) |
|---|---|---|---|---|---|
| 33–78.2 | 7v | 283, 203 | — | — | 1.42, 1.36 |
| 36–72 | 7t | 209, 255 | — | — | 1.42, 1.34 |
| 39.1–78.2 | 7u | 170, 178 | 331, 339 | 1.44, 1.39 | 1.42, 1.36 |
| 45–90 | 7w | 117, 119 | 302, 306 | 1.58, 1.47 | 1.45, 1.36 |
| 52–104 | 7x | 75, 87 | 253, 246 | 1.64, 1.61 | 1.41, 1.36 |
| 60–120 | 7x | 36, 51 | 193, 188 | 1.74, 1.77 | 1.51, 1.47 |
| 75–150 | 7z | 29, 33 | 117, 103 | 1.98, 1.86 | 1.43, 1.44 |
| 39.1–100 | 7ab | 82, 109 | 266, 277 | 1.47, 1.54 | 1.42, 1.33 |
| 39.1–125 | 7ac | 39, 62 | 204, 206 | 1.57, 1.65 | 1.49, 1.40 |
| 39.1–150 | 7aa | 27, 38 | 138, 131 | 2.23, 1.76 | 1.45, 1.42 |
| 39.1–200 | 7ab | 17, 36 | 50, 71 | 2.02, 2.27 | 1.55, 1.52 |

"—": not scored at that law or not response-tested. Rise times are the median over seeds of each
design's median over episodes, at the 36 ms law; in calm air at lever 1 they are the same to three
decimals at all three identified laws (milestone 7y).

**Matching the training range to the uncertainty is the worst choice.** The interval that contains
the identified range most tightly (33–78.2 ms) crashes most, and moving its floor to the slow end
(39.1–78.2 ms) cuts the crashes from 486 to 348 of 2,304 (pooled over geometries, 12 designs a side,
permutation Mann-Whitney p = 0.011; per-cell tests at six seeds gave p of 0.05 or more). Seeing the
fast end of the range in training buys nothing at the fast end: at the 33 ms law alone, the designs
trained down to 33 ms crash more than the 39.1 ms-floor designs in all four arm-geometries of
milestone 7v (the two objectives × two geometries).

**The ceiling, not the floor, buys the robustness.** Raising the floor with the interval width fixed
at 2× (rows 39.1–78.2 to 75–150) cuts the identified total from 348 to 62, and that was first read
as "tune for a slower motor". Holding the floor at the identified 39.1 ms and raising only the
ceiling separates the two: 39.1–150 ms crashes 65 times against 75–150 ms's 62 (p = 0.83), so the
floor contributes nothing once the ceiling is high. Along the ceiling sweep at that floor (78.2, 100,
125, 150, 200 ms) the identified total falls in both geometries (Jonckheere–Terpstra, one-sided,
p ≤ 0.0001, the permutation floor), steeply at first and then slowly: pooled neighbours differ at
78.2→100 ms (p = 0.018) and 100→125 ms (p = 0.025), not at 125→150 ms (p = 0.10) or 150→200 ms
(p = 0.16). The total for each row has a stratified bootstrap interval in `table7_stats.txt`
(e.g. 101 [79, 125] at 125 ms against 65 [49, 82] at 150 ms). At the 75 ms law, slower than either
identification, every extra step of ceiling pays and every pooled neighbour pair is separated
(p ≤ 0.0002), down to 121 crashes of 768 at 200 ms.

**The price is response, not crashes.** Coverage costs nothing inside the identified range up to
200 ms (row 39.1–200 is the most robust in the table). It is paid in rise time, mass and a slower final
approach: rise grows from 1.44, 1.39 s at a 78.2 ms ceiling to 2.02, 2.27 s at 200 ms, and the
200 ms designs are 6–7% heavier than the 150 ms ones. The rise does not grow smoothly: 125 ms keeps
most of 100 ms's speed (1.57, 1.65 s), and with the centre of pressure above the jump arrives
between 125 and 150 ms. The search never asks for a fast final approach, so in every set one to five
of twelve designs settle short of the hold point by 5–8 cm (milestones 7y–7ac); the next paragraph gives the cause
and a fix that needs no retuning.

**Why some tunes never settle, and a fix without retuning (milestone 7ad).** The cause is the
position loop alone. A PID on a double integrator, s³ + kd s² + kp s + ki, has a slow closed-loop root
near −ki/kp, so what the integrator stores during the approach leaves a tail of about (ki/kp)·I₀ that
decays on a time scale kp/ki; on a 6 s flight it is largest near ki/kp ≈ 1/6 s⁻¹. Training scores
gusts about a 3 m/s mean wind, where integral action pays, and never a set-point step, so nothing
opposes a large ki/kp. A three-state model of the outer loop (PID, the proportional cap, the tilt
limit as an acceleration bound and the integrator clip; no attitude loop, motor or side force)
predicts the simulator's last-second distance with r = 0.9995 on 96 designs never step-tested before
and calls all 96 correctly (15 unsettled); the call is the same at 33, 36 and 39.1 ms for all 96
(`m7ad_settle/verdicts.txt`). The textbook anti-windup remedy, conditional integration
[astrom2006], here running the position integrator only while the error is under b = 0.25 m, leaves
0 of 72 section-VII designs unsettled (18 before) and cuts the median overshoot from 5.1 to 2.0 cm,
with the stress test where it was (identified total 819 against 820 over the six sets of rows
39.1–78.2 to 75–150; paired Wilcoxon p = 0.89) and the 6 m/s wind-step peak unchanged. The price is
a slower rise, median 1.91 against 1.74 s, since the integrator no longer helps pull the vehicle in.
A tighter band, b = 0.1 m, gives the same picture (814). A builder can screen a tune for this with
the three-state model before flying it. Retraining with the band on (milestone 7ae, 125 ms ceiling) does not
recover the rise: median 1.83 against 1.84 s (Mann-Whitney p = 0.95), with kp and kd unchanged and
ki/kp cut about tenfold (0.057 to 0.005 s⁻¹). Every set lies on one rise-overshoot frontier: the
always-on tunes' fast rises came with 7–16 cm overshoots, so the slower rise is the price of not
overshooting (`m7ae_cint_train/verdicts.txt`).

**Why a tuner should see plants beyond the test range (a reading, not tested here).** The CMA-ES objective is a mean over
randomised episodes. When fast plants are in the draw, gains that track them well raise that mean
and are paid for at the slow edge, where the margin of the attitude loop is thinnest; when the draw
extends well past the slowest lag that will be flown, the search must keep margin across the whole
interval it is scored on, and the flown range sits inside it. It is close to the argument for active
domain randomisation [mehta2019], that uniform sampling spends training on environments that teach
little and the sampling range should be chosen, not assumed; here it is measured on a
certificate-constrained gain tuner rather than a learned policy, with a range read off a motor
identification.

**For a builder.** Anchor the randomised lag at the slowest identified value for your motor class,
not at a midpoint, and never draw faster plants than that. Set the ceiling at about 3–4× it:
125 ms (3.2×) gives most of 150 ms's robustness at the identified lags with near-100 ms rise times;
go to 150–200 ms only if the motors may be slower than identified, at up to about 0.7 s more rise
time than the 125 ms tune. Run the position integrator only within about a quarter of a step of the set
point; with that, the 125 ms tune has no unsettled designs.

**Figure plan.** VII-a: identified total and 75 ms count against the training ceiling at the
39.1 ms floor, with the floor rows as a second series against their ceiling (`m7ac_ceil125.png`,
extended). VII-b: rise time against identified total for all eleven rows, the coverage frontier
(`m7z_floor75.png`, extended).

## VIII. Limitations (outline)

One stylised simulator for the position-loop work (RotorPy only re-scores attitude); plant ranges,
gust model, mass and cost fits inherited and unsourced; six seeds per arm in milestones 6–7ac
(below the proposal's ten for paper figures; section VII pools the two geometries to reach twelve);
the lag ceilings of section VII are brackets, not sourced values, and the motor lag is the only
uncertain input whose randomisation range was swept (torque scale and mass keep U(0.7, 1) and
U(0.9, 1.3)); vertex-sampled stability; no hardware (milestone 8,
an owner step: printed mounts at 0° and the co-designed angle, a load cell and a yaw-rate log).

## IX. Conclusion (outline)

Cant of about 30–35° pays on a small X quadrotor under every attitude law and both simulators, and
its side force is the price; cancel the steady part with an integrator feed-forward, certify the
loop with an 11-state linear check at 0.8× the integral-gain ceiling, and test at the autopilot's
real tilt limit. Randomise the motor lag from the slowest identified value up to 3–4× it, and integrate the position error only near the set point.

## Still to do before submission

- Ten seeds for the paper figures (proposal, "Evaluation"); bootstrap intervals and Wilcoxon tests in place of sign counts.
- Section VI: a figure for milestone 7g's authority result, and a whole-loop margin (spectral radius bound below 1).
- Section VII: figures VII-a and VII-b; the same coverage sweep on the torque-scale and mass ranges; a set-point
  step term in the objective (milestone 7ae: training with conditional integration does not recover the rise time); twelve seeds per geometry at 125 and 150 ms.
- Sections I–V and VII–VIII written out from the outlines; LaTeX in the RA-L template.
- Hardware check (milestone 8).
