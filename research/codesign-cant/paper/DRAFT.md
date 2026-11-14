# Draft: when does rotor cant pay on a small quadrotor co-designed with its motors and controller?

Status: **milestone 7, first draft (2026-11-14): outline of every section, section VI (stability of
the side-force feed-forward, milestones 7c–7g) written in full. Not submittable.** Target: *IEEE Robotics and
Automation Letters* (6 pages + 2), fallback ICUAS; an aim, not a claim of acceptance.

Every number in this file is copied from a results file under `../experiments/` or from
[`../LOG.md`](../LOG.md), and nothing here is new. `python3 paper/check_numbers.py` (from the project
directory) checks each quoted figure in section VI and the abstract against the file named beside it,
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
those divergences for about 0.7% of held-out cost.

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
   (milestones 7c–7f). Code and data: MIT, one command per figure.

## II. Related work (outline)

Tilted and fully actuated multirotors [crowther2011, rajappa2015, michieletto2018, hamandi2021,
ryll2015, brescianini2016]; computational co-design [du2016, zhao2020, carlone2019] with CMA-ES
[hansen2001]; attitude laws [lee2010, smeur2016] and learned control [hwangbo2017, kaufmann2023];
allocation [johansen2013]; simulators [folk2023, panerati2021]; propeller data [brandt2011]. For
section VI: robust stability of a plant box checked at its vertices is a sampled test, not a
guarantee, for a multi-parameter family [bartlett1988]; we report it as such.

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

## VII. Limitations (outline)

One stylised simulator for the position-loop work (RotorPy only re-scores attitude); plant ranges,
gust model, mass and cost fits inherited and unsourced; six seeds per arm in milestones 6–7f
(below the proposal's ten for paper figures); vertex-sampled stability; no hardware (milestone 8,
an owner step: printed mounts at 0° and the co-designed angle, a load cell and a yaw-rate log).

## VIII. Conclusion (outline)

Cant of about 30–35° pays on a small X quadrotor under every attitude law and both simulators, and
its side force is the price; cancel the steady part with an integrator feed-forward, certify the
loop with an 11-state linear check at 0.8× the integral-gain ceiling, and test at the autopilot's
real tilt limit.

## Still to do before submission

- Ten seeds for the paper figures (proposal, "Evaluation"); bootstrap intervals and Wilcoxon tests in place of sign counts.
- Section VI: a figure for milestone 7g's authority result, and a whole-loop margin (spectral radius bound below 1).
- Sections I–V and VII–VIII written out from the outlines; LaTeX in the RA-L template.
- Hardware check (milestone 8).
