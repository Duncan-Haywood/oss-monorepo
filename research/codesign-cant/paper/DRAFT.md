# Draft: when does rotor cant pay on a small quadrotor co-designed with its motors and controller?

Status: **milestone 7, first full draft (2026-11-14; section VII added 2026-11-19, milestone 7ad's settling paragraph, 7ae's retraining check and 7af's step objective the same day; 7ag-7ai's rise-time rule 2026-11-19 to 20; sections III-V written in full 2026-11-21, and sections I, II, VIII and IX with the combined figure IV-V later the same day): every section is written in full. Not submittable.** Target: *IEEE Robotics and
Automation Letters* (6 pages + 2), fallback ICUAS; an aim, not a claim of acceptance.

Every number in this file is copied from a results file under `../experiments/` or from
[`../LOG.md`](../LOG.md), and nothing here is new. `python3 paper/check_numbers.py` (from the project
directory) checks each quoted figure in sections I and III–IX and the abstract against the file named beside it,
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
the instability; at PX4's default 45° limit such designs diverge on 31 of 640 held-out flights (ten
seeds). An 11-state linear test added as a training constraint at 0.8× the integral-gain ceiling
leaves 1 of 640 for about 0.8% of held-out cost, and two of the ten unconstrained tunes diverge even
at the 20° limit they were tuned at. Finally, the motor lag: tuned at an unsourced
15 ms, no design is certified, and nearly every stress flight diverges, at the 33–39 ms two
published identifications give. Retuning shows that
how the lag is randomised in training matters more than its nominal value: drawing plants exactly
across the identified range is the worst choice tested, and anchoring the draw at the slowest
identified lag with a ceiling about 4× higher cuts the identified-range crashes by seven eighths
against that draw (486 to 65 of 2,304), paid in rise time rather than crashes; at ten seeds a 3.2×
ceiling still crashes 1.75 times as often as a 3.8× one (p = 0.004). That rise time can
be computed before flying: a point mass of the outer loop with one lag taken from the linearised
attitude loop puts 36 of 36 designs within 0.10 s of their flown rise in all seven conditions tested.

## I. Introduction (full draft)

Yaw is the weakest axis of a quadrotor. Roll and pitch torque come from thrust acting on an arm; yaw
torque comes only from the propellers' reaction torque, which per newton of thrust is κ = cD, with
c = 0.081 over measured propellers [brandt2011], so κ/L is about 0.03–0.1 on small frames. A vehicle
that must hold heading in gusts, or a heavy-lift frame with large, slow propellers, runs out of yaw
first. Builders know this, and some cant their motors a few degrees about the arm so that part of each
rotor's thrust turns into yaw torque. The angle is set by rule of thumb. Cant has a price: each rotor
hovers at mg/(4 cos α), so hover power grows as cos α^−1.5, and a canted rotor pushes the frame
sideways whenever it makes roll or pitch torque.

Two literatures touch this question and neither answers it. Work on tilted and fully actuated
multirotors chooses rotor tilt for force-moment decoupling on six or more rotors, or analyses the
allocation alone [crowther2011, rajappa2015, michieletto2018, hamandi2021]. Computational co-design
optimises frames and parts with the controller fixed, derived from the design model, or absent
[du2016, carlone2019]. Neither asks what fixed cant a four-rotor X should have when its controller is
tuned for each design under plant uncertainty, its power is priced, and its torque limits come from
the thrust-bounded allocation rather than a linearised authority. That is the question here, and its
answer is not small. Co-designing the arm, propeller, cant and controller gains with CMA-ES
[hansen2001] in a randomised simulator, cant pays under every attitude law we tried, and the optimum is
28–37°, not the few degrees of the rule of thumb.

The side force is where cant stops being free, and following it leads from a design question into a
tuning question that applies to any randomised tuner. An integrator feed-forward cancels the steady side
force, but CMA-ES tunes the resulting loop onto its linear stability boundary. In the simulator only a
20° tilt-command limit hides this, and at PX4's default 45° the same tunes diverge. A linear certificate
used as a training constraint fixes that. Retuning at published motor identifications then shows that
the motor-lag range the tuner is trained on matters more than its nominal value.

Contributions:

1. Closed-form attainable torques and side force for the canted X from the full 6×4 allocation, checked
   against a linear programme to 1e-15, which correct the hand-written limits of the earlier projects
   this programme consolidates by up to 2√2× in yaw (section III).
2. The co-designed cant and its price: paired by seed, cant beats no cant by 4.18–5.27° of held-out
   attitude error under PID, INDI [smeur2016] and geometric control [lee2010], 10 of 10 seeds each, at a
   chosen angle of 33.9–35.3° (median per law); pricing hover power changes the vehicle's size, not the
   angle; the ranking survives an independent simulator, RotorPy [folk2023] (section IV, V).
3. A linear stability test for the side-force feed-forward, built by stepping the simulator's own update,
   which is necessary but not sufficient, and which, used as a training constraint at 0.8× the
   integral-gain ceiling, cuts the divergences at PX4's 45° tilt limit from 31 to 1 of 640 for about 0.8%
   of held-out cost (section VI, ten seeds).
4. A measured rule for the motor-lag randomisation range when only a published identification is known:
   floor at the slowest identified lag, ceiling at about 4× it; drawing plants exactly across the identified
   range is the worst choice tested (section VII).
5. A rise-time rule for the resulting tunes that needs no flight: a point mass of the outer loop plus one
   first-order lag computed from the linearised attitude loop over the randomisation range (section VII).

Everything is simulated, and section VIII lists what that leaves open. Code, results files and one
command per figure are MIT licensed; every number in this draft is checked against its results file by
`paper/check_numbers.py`.

## II. Related work (full draft)

**Tilted and fully actuated multirotors.** Crowther et al. [crowther2011] showed that tilting a
quadrotor's rotors out of plane adds yaw authority, through the allocation and the control design, with
no sizing, power or controller co-design. Rajappa et al. [rajappa2015] optimised the tilt angles of a
hexarotor for full actuation, and Michieletto et al. [michieletto2018] gave the structural theory of
which tilt patterns decouple force from moment. Hamandi et al. [hamandi2021] map multirotor designs by
their allocation properties. At the other ends of the spectrum, Ryll et al. [ryll2015] tilt a
quadrotor's rotors actively with servos, and Brescianini and D'Andrea [brescianini2016] fix eight rotors
in an omnidirectional layout at a large efficiency cost. Fixed cant on a four-rotor X is the cheap,
passive case: it cannot decouple force from moment, and the question is not whether the vehicle becomes
fully actuated but whether a better-conditioned yaw axis is worth its power and its side force once the
controller is retuned. Our allocation follows the constrained-optimisation view of the survey by Johansen
and Fossen [johansen2013]; the attitude-priority mixer we fly is the one common autopilots use.

**Computational co-design.** Du et al. [du2016] optimise multicopter geometry and parts with an LQR
controller derived for each design; rotors are coplanar or tilted by the user, and the plant is not
randomised. RoboGrammar [zhao2020] searches morphology and control jointly for legged robots, and
Carlone and Pinciroli [carlone2019] pose drone component selection as a formal co-design problem without
dynamics. We co-design the geometry and the gains with CMA-ES [hansen2001] against a held-out,
randomised plant, and treat the controller's tuning as part of the design, which is what makes the
stability and randomisation findings of sections VI and VII possible.

**Attitude control and learned control.** We compare three laws: cascaded PID, incremental nonlinear
dynamic inversion [smeur2016], which is robust to the actuator uncertainty of small vehicles, and
geometric control on SO(3) [lee2010]. Learned low-level control [hwangbo2017] and sim-to-real
reinforcement learning with identified models [kaufmann2023] reach hardware with the airframe fixed;
our results suggest the airframe is worth putting in the loop, and that how the training plant is drawn
matters as much for a gain tuner as for a policy.

**Randomisation and its range.** Domain randomisation [tobin2017] and dynamics randomisation [peng2018]
train across a range of simulators so that the real system looks like one more draw; active domain
randomisation [mehta2019] argues that uniform sampling wastes training on environments that teach little
and that the range should be chosen. Section VII measures that choice for one parameter, the motor lag,
on a certificate-constrained gain tuner, with the range anchored to two published identifications of
the motors our designs use [bauersfeld2021, foehn2022].

**Stability of a plant family and integrator windup.** Checking a linear model at the vertices of a
parameter box is a sampled test: for a multi-parameter family stable vertices do not guarantee a stable
interior [bartlett1988], and we report the certificate as such. Conditional integration, the anti-windup
remedy of section VII, is textbook [astrom2006].

**Simulators and data.** RotorPy [folk2023], with first-order motor speed dynamics and rotor drag, is
the second simulator; we extend its wrench for canted rotors. gym-pybullet-drones [panerati2021] is the
PyBullet alternative we did not use. Propeller reaction torque comes from the UIUC measurements
[brandt2011].

## III. Model (milestones 1, 2; full draft)

**Vehicle and sizing.** The vehicle is a four-rotor X. Each rotor is canted by α about its own arm axis,
with the direction alternating with spin, so the tangential thrust components cancel at hover and add in yaw.
The design variables are the arm length L (0.08–0.30 m), the propeller diameter D (0.08–0.25 m), α and the
controller's parameters. Mass comes from a closure: a 0.25 kg payload, 0.06 kg of electronics, a battery for
15 min of hover at 150 Wh/kg and 80% depth of discharge, a frame of 0.05 + 0.8 L kg, and four motors sized for
the thrust-to-weight ratio (TWR) times hover thrust. Each rotor hovers at mg/(4 cos α), so cant is paid in thrust.
Hover power is momentum theory with a figure of merit of 0.65 and a drive efficiency of 0.75. A design is
feasible when the propellers clear (√2 L ≥ 1.05 D) and its parts cost at most $300. The reaction torque per
newton of thrust is κ = cD with c = 0.081, the median over measured UIUC propellers [brandt2011]. The mass,
cost and motor fits are inherited assumptions. Milestones 7p and 7q replace them with laws fitted to listed
frames and components, and those replacements apply to section VII only.

**Actuator.** We write out the full 6×4 map from rotor thrusts to body wrench (`allocation.py`). Let
Δ = min(T_h, T_max − T_h) with the collective held at hover, or T_max/2 with the collective free. Then the pure-axis
torque limits are

  roll 4Δ(L cos α − κ sin α)/√2,  yaw 4Δ(L sin α + κ cos α),

and the side force per unit roll torque is lat = sin α/(L cos α − κ sin α). These closed forms agree with a
linear programme over thrusts in [0, T_max] to 1e-15 on 300 random designs (`tests/test_allocation.py`). The
seven single-step projects this programme consolidates used hand-written limits. Those limits understated yaw
authority by 2× with no cant and by up to 2√2× with cant, overstated roll authority above TWR 2 (they let rotors
go below zero thrust), and took the side force √2 too large (milestone 1). The roll, pitch, yaw and collective
rows of the canted map are orthogonal sign patterns, so combined commands share one thrust polytope. We fly it
with an attitude-priority mixer (`allocation.mix_priority`): roll and pitch are scaled together first and yaw
gets what is left, as in PX4 and Betaflight. The collective is held at hover (`prio`) or left free, as in airmode
(`prio_free`). Milestone 1's per-axis box (`box`), in which every axis can saturate at once, is kept only as a
reference (milestone 2).

**Attitude simulator (sections IV–V).** The simulator integrates Euler's rigid-body equations with ZYX
kinematics at 2 ms and passes the torque through a first-order lag. The disturbance is a gust torque
½ρA·ℓ·v|v| on roll and pitch, with frame area A = 0.02 + 0.5 L² and a lever ℓ = 0.05 + 0.3 L. The wind v is an
Ornstein–Uhlenbeck process with a 0.5 s correlation time, a mean of 3 m/s and a standard deviation of 4 m/s.
The task is a 2 s episode of independent ±15°, ±15° and ±30° steps on roll, pitch and yaw (four 0.5 s segments).
The controller reads angles and rates one step late, with noise. Each episode draws its plant from the wide box:
torque scale U(0.7, 1), inertia scale U(0.9, 1.3) and lag scale U(1, 2), none of them known to the controller. An
episode whose roll or pitch passes 60° is scored at 60° from then on. A design's score is the RMS attitude
error over 64 held-out episodes on a seed never used in training. With hover power priced it is
J = −RMS − λ·P_hover/100 W, where λ is in degrees per 100 W.

**Search.** CMA-ES [hansen2001] searches the design and the controller together, with 1920 evaluations per
run. From milestone 2's follow-up on, each run keeps the best training score of three starts, with cant started
at 4°, 32° and 64° of an 80° bound, because the landscape under the shared polytope is multimodal. Milestones 1
and 2 ran five seeds and were extended to ten (`m12_ten_seeds`, seeds 5–9 added with nothing else changed); milestone 4 uses ten.
Paired results are given with a percentile bootstrap 95% interval over seeds and an exact two-sided Wilcoxon
signed-rank p, whose floor at ten seeds is 0.002 (`m12_ten_seeds/results.txt`).

**Position-hold model (sections VI–VII).** Milestone 6 adds the translational axes. The side force is
F_y = lat·τ_x and F_x = lat·τ_y. The centre of pressure is rigidly offset, so the roll and pitch disturbance
signs are opposite (milestone 6b). Each 6 s position-hold episode has a ±3 m/s wind step at 3 s, and the score is
J = −√((pos/0.10 m)² + (yaw/10°)²) − 0.03·P_hover/100 W. Sections VI and VII give the controller, the tilt-command
limit and the motor-lag law each one adds.

## IV. Where the optimum is, and whether a better controller removes it (milestones 1, 2, 4; full draft)

**The corrected actuator keeps the advantage.** Correcting the actuator model (section III) does not shrink
cant's advantage. Paired by seed at TWR 2, cant ≤ 35° beats no cant by 4.85° of held-out RMS (95% interval
4.79–4.92°) with the allocation's limits, against 4.50° with the earlier formulas (10 of 10 seeds each, p = 0.002;
`m12_ten_seeds/results.txt`). Doubling the uncanted vehicle's yaw authority improves it by only 1.49° (16.96° to
15.47°), because yaw still dominates its error. What the correction does remove is the earlier "motor headroom"
story. With TWR free and the collective held at hover, the canted optimiser picks TWR 2.0–2.1, since above 2 the low
rotors can go no lower; the uncanted one picks 2.1–3.7 (mean 2.5), still far below the earlier projects' 5. The interior optimum near TWR 5 in the earlier projects was an artefact of letting
thrust go negative.

**A shared polytope costs accuracy, and cant keeps its advantage on it.** On one thrust polytope, a tuned
uncanted vehicle saturates roll and pitch on 94–99% of held-out steps in 7 of 10 seeds, and the attitude-priority
mixer then gives yaw nothing on all of them (`m12_ten_seeds/results.txt`, λ = 0). The other three seeds
found a second optimum: about 1700 W of hover power, roll and pitch saturated on under 1% of steps, and 16.7–17.1°
of error against 18.1–18.8° for the saturated ones. Cant moves yaw onto the tangential force; the canted designs
saturate roll and pitch on 0.5–1.0% of steps (one seed excepted, below). The attitude-priority mixer costs
2.42° without cant and 2.31° with it (10 of 10 seeds each, p = 0.002), and cant's paired advantage under it is
4.98° (95% interval 3.64–5.91°, 9 of 10 seeds, p = 0.004) against 4.86° under `box` (10 of 10). At five seeds
this read 6.08° against 4.81°, "cant worth more on the polytope"; with ten the two are within each other's
intervals, so we claim only that the advantage survives the shared polytope. Airmode recovers 1.14° for the
uncanted vehicle and 0.88° for the canted one (p = 0.002 and 0.010).

**The optimum is large, and pricing power does not shrink it.** The rule of thumb, and our hypothesis H1, put
the optimum at 5–20°. It is not there. Pricing hover power at 0.3° per 100 W cuts it by 3.0–7.0× under `box` and `prio`
(`box`, canted: 1350 W to 225 W, ten-seed means), while RMS under `box` moves by at most 0.45°. From 0 to 1° per 100 W the chosen
cant stays at 29–39° under `box` (`m12_ten_seeds/results.txt`). With three starts per seed under `prio`, it is 28–37° in 19 of 20
seed-arms at λ = 0.3 and 1 (`m12_ten_seeds/results.txt`). The twentieth found only a 4° design from all three starts.
With three starts cant wins 10 of 10 seeds at λ = 0.3 and 9 of 10 at λ = 1 (3.84°, 95% interval 2.47–4.86°, p = 0.004).
Without restarts, two of ten seeds fall to low cant (under 15°) at λ = 0.3, five of ten at λ = 1 and one even at λ = 0
(9.5°, the λ = 0 seed cant loses). At λ = 0.3 the two score 18.51° and 21.43° held out, against 12.91–13.03° for the
seeds 0–4 that kept cant. That is an optimiser failure, not a second optimum. Cant is a size
decision only in milestone 1's power-free objective: what that objective inflated was the vehicle's mass, not
its angle.

**A better attitude law narrows the advantage and does not remove it.** A reviewer's first question is
whether cant only patches a weak controller. Milestone 4 retunes from scratch under two stronger laws, with the
attitude-priority mixer, TWR 2, λ = 0.3, ten seeds and three starts each. The first is incremental nonlinear
dynamic inversion (INDI) [smeur2016], with a nominal actuator model and no adaptive effectiveness estimate. The
second is geometric control on SO(3) [lee2010]. Table IV-1 gives the results.

Table IV-1. Held-out attitude RMS (degrees, mean of ten seeds), paired cant-minus-no-cant difference, and the
median chosen cant (`m4_controllers/results.txt`). Every paired difference has exact Wilcoxon p = 0.002; the bootstrap
95% intervals are −6.10 to −4.57° (PID), −4.33 to −4.03° (INDI) and −5.01 to −4.77° (geometric) (`m12_ten_seeds/results.txt`).

| law | no cant | cant ≤ 80° | paired difference | seeds better | chosen cant (median) |
|---|---|---|---|---|---|
| PID | 18.35 | 13.08 | −5.27 (SD 1.32) | 10 of 10 | 34.2° |
| INDI | 17.10 | 12.92 | −4.18 (SD 0.25) | 10 of 10 | 33.9° |
| geometric | 17.61 | 12.73 | −4.88 (SD 0.20) | 10 of 10 | 35.3° |

INDI narrows the advantage against PID by 1.09° (9 of 10 seeds) and geometric control by 0.38° (5 of 10).
Neither law removes it. INDI without cant is 4.02° worse than PID with cant in 10 of 10 seeds, and geometric
control without cant is 4.53° worse. Without cant the mixer still scales yaw on 54% (INDI) to 60% (geometric) of
held-out steps, and no law can make yaw torque the rotors cannot produce. Most of what INDI buys is consistency
in the uncanted vehicle: PID without cant ranges 17.2–21.1° across seeds and INDI 16.9–17.6°. At twice the gust
intensity, cant still wins 10 of 10 seeds under every law (−9.82° PID, −4.51° INDI, −5.78° geometric). About half
of PID's larger advantage there is a controller effect that INDI also removes. The optimum does not depend on
the law: the median chosen cant is 33.9–35.3°. Figure IV-V (`paper/fig_IV_V.png`, drawn by `paper/figures_iv_v.py`
from the results files) shows each seed's chosen cant against the 5–20° band of the rule of thumb (panel b) and
each seed's paired advantage in both simulators (panel a).

**For a builder.** On a small X quadrotor that must hold heading, a fixed cant of about 30–35° is worth about
4–5° of held-out attitude error, whatever the attitude law. Pricing hover power changes how big the vehicle
should be, not that angle. Search the cant from several starting angles, because a single start can settle on a
low-cant local optimum that is not one.

## V. Does it survive another simulator? (milestone 5; full draft)

**Set-up.** Everything in section IV comes from one stylised simulator, with a torque lag, a gust torque and
perfect altitude hold. We re-score the 60 milestone-4 designs, unchanged and not retuned, in RotorPy 3.0.0
[folk2023]. RotorPy is an independently written simulator with a quaternion rigid body, first-order motor
*speed* dynamics with thrust ∝ ω² and RK45 integration. It assumes every thrust axis is body z, so we
subclass its multirotor and replace only the wrench (`rotorpy_twin.py`). Each rotor thrusts along its canted
axis, its rotor drag and induced inflow act in the rotor's own frame, and its reaction torque turns with the
axis. At α = 0 the subclass reproduces RotorPy's own wrench to 1e-12. The controller is the same law with the
same gains, measurements and mixer, plus an altitude loop that RotorPy needs and the stylised model does not.
The aerodynamic coefficients are RotorPy's Hummingbird file scaled to each propeller by momentum-theory
exponents, which is an assumption. There are four conditions: `torque` (RotorPy body and motors driven by the
stylised gust torque), `aero` (RotorPy's aerodynamics driven by the same wind), `aero_cop` (frame drag at the
stylised lever) and `aero_cop2` (rotor drag doubled). Each design flies 32 held-out episodes.

**The ranking a designer acts on survives.** The six law × cant arms keep their order. Their Spearman ρ against
the stylised simulator is 1.000 under `aero` and `aero_cop2` and 0.943 under `torque` and `aero_cop`
(`m5_rotorpy/noise_ceiling.txt`), and geometric control with cant is the best arm in every condition. Over all 60
designs ρ is 0.799 (`torque`) and 0.880–0.908 (aero conditions) (`m5_rotorpy/results.txt`). The ceiling for
comparison is the stylised simulator's agreement with itself on fresh episodes, ρ 0.950–0.965. Our
pre-registered test, H5, asked for ρ ≥ 0.5 over the top ten designs. It is refuted at 0.20–0.30, but it could
not have been met. The top ten are canted INDI and geometric designs whose stylised J spans 0.064, so they are
tied, and the stylised simulator re-ranks them against itself with ρ 0.258 on average (range −0.224 to 0.467).
That test measured episode noise, not fidelity. In place of H5's top-ten test (a change made after the fact),
we report arm-level agreement and all-design ρ as a fraction of the self-agreement ceiling.

**Cant still wins.** Paired by seed, cant beats no cant in 10 of 10 seeds for every law in every aero condition:
PID −4.76 to −5.77°, geometric −4.70 to −5.08° and INDI −3.12 to −3.53°, against stylised −5.56, −4.86 and −4.15°.
INDI without cant stays worse than PID with cant in 10 of 10 seeds in every condition (+3.10 to +3.97°).

**Where the stylised model is optimistic.** RotorPy adds 1.25–1.47° of RMS on average in the aero conditions, with 1–3
divergent episodes of 1920. The stylised gust torque is harsher than RotorPy's aerodynamics: with it injected
(`torque`) the added error is 3.41° and 54 episodes diverge, 43 of them on uncanted designs. A likely reason,
not tested separately, is that in RotorPy the vehicle drifts with the wind, so airspeed and drag fall while an
injected torque does not. INDI loses most in the move (canted designs lose 1.8–2.1° in the aero conditions). Its
increment rests on a torque-lag actuator model, and RotorPy's actuator is a speed lag. The law that relies most
on a model is hurt most when the model changes. Doubling the rotor drag moves mean RMS by under 0.25°, so the
conclusions do not hang on the assumed drag scaling. Figure IV-V, panel a, shows the paired advantage per seed in all
five conditions: in the injected-torque condition the spread widens and 2 of 10 INDI seeds lose their advantage
(`m5_rotorpy/results.txt`), the only seeds of 150 in the five conditions where cant does not win.

**Limits of this check.** The designs are not retuned in RotorPy, so part of INDI's loss may be recoverable. The
aerodynamic coefficients are scaled, not measured. Only attitude is re-scored: the position-loop results of
sections VI and VII rest on the stylised simulator alone (section VIII).

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
0.257 m (`m7e_margin/tilt.txt`, six seeds; 31 of 640 at ten, Table VI-1). A design that looks safe in a simulator with a tight tilt limit
inherits a failure mode at a stock autopilot setting.

**The certificate as a training constraint, and how much margin.** We reject any CMA-ES candidate
whose linear model is unstable at a plant corner at k_i·M, for margins M from 1.0 to 1.67 (the
rejected candidate is not simulated; milestones 7e and 7f at seeds 0–5, milestone 12b at 6–9, ten
seeds per arm, 3,200 evaluations). The optimiser sits on whatever bound it is given (ceiling
multiples 1.26–1.31 at M = 1.25, in 10 of 10 seeds), so the margin is the design parameter. Table
VI-1 gives the held-out result at the trained 20° limit, at PX4's default 45° limit and at twice the
trained centre-of-pressure lever, outside training (`m12b_ten_seeds_vi/stats.txt`).

| ki bound (× ceiling) | none | 1.0 | 0.9 | 0.8 | 0.7 | 0.6 |
|---|---|---|---|---|---|---|
| diverged of 640, 20°, trained lever | 2 | 0 | 0 | 0 | 0 | 0 |
| diverged of 640, 45°, trained lever | 31 | 19 | 6 | 1 | 1 | 0 |
| diverged of 640, 45°, twice the lever | 83 | 62 | 39 | 23 | 23 | 23 |
| held-out J − unconstrained, 20°, trained lever (8 seeds) | 0 | −0.003 | −0.010 | −0.012 | −0.009 | −0.011 |

Robustness has a knee at 0.8×: at 45° the arms at 0.8× and tighter beat the unconstrained designs
in 10 of 10 seeds (Wilcoxon p = 0.002, mean held-out J +1.9 to +2.0), while 0.9× still diverges on
6 of 640. Below 0.8× nothing improves further. The cost row is post hoc: it pairs each arm with
the unconstrained designs over the eight seeds whose unconstrained tune never diverged at the
trained condition. There 0.8× costs 0.012 in J (0.8%; 95% interval 0.008–0.016, worse in 8 of 8,
p = 0.008), with position error 0.105 m in every arm: the other gains take up the integral gain's
slack. Over all ten seeds the constrained arms are cheaper on average (+0.076 to +0.082, p ≥ 0.43),
because two of the ten unconstrained tunes (seeds 6 and 9) each diverge on one of 64 flights at the
20° limit they were trained at; the six seeds of milestones 7b–7f had shown none. The linear check
is therefore not only insurance against a looser tilt limit. Requiring only stability at every
corner (M = 1.0) removes about two fifths of the 45° divergences (31 to 19), not all of them. Training stays cheap: 10–15% of candidates are rejected and wall time is no worse than
unconstrained, since a rejected candidate costs one eigenvalue check of an 11×11 matrix at eight
corners instead of a 16-episode rollout.

**What it does not fix.** At twice the trained lever a floor of 23 divergences in 640 remains at
every bound from 0.8× down (Table VI-1, third row). No ki margin moves it, so it is not an
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
78.2→100 ms (p = 0.018) and 100→125 ms (p = 0.025). At six seeds they did not differ at 125→150 ms
(p = 0.10) or 150→200 ms (p = 0.16). Ten seeds per geometry at 125 and 150 ms (milestone 12c,
`m12c_ten_seeds_vii/stats.txt`; predictions committed before the run) separate the first pair:
196 against 112 crashes of 3,840 (pooled Mann–Whitney p = 0.004), and 125 ms crashes more in 17 of
20 (geometry, seed) pairs (exact Wilcoxon p = 0.00003). The four new seeds alone give 95 against 47.
So robustness at the identified lags keeps coming up to 150 ms (3.8× the slowest identification).
Ten seeds per geometry at 200 ms (milestone 12d, `m12d_ten_seeds_c200/stats.txt`) do not separate the
next pair: 112 against 86 crashes of 3,840 (pooled Mann–Whitney p = 0.08), and 150 ms crashes more in
only 13 of 20 pairs, ties 4 (exact Wilcoxon p = 0.07). On the identified range the knee is at about
150 ms; any gain past it is under a quarter and not detected at ten seeds. Ten seeds per geometry at
100 ms (milestone 12e, `m12e_ten_seeds_c100/stats.txt`) keep the step below: 326 against 196 crashes
of 3,840 against 125 ms (pooled Mann–Whitney p = 0.04), 100 ms worse in 17 of 20 pairs (exact Wilcoxon
p = 0.001). At ten seeds the four knee-region rows read 326 / 196 / 112 / 86 of 3,840 at 100 / 125 /
150 / 200 ms. The total for each row has a stratified
bootstrap interval in `table7_stats.txt` (e.g. 101 [79, 125] at 125 ms against 65 [49, 82] at
150 ms; at ten seeds 196 [156, 242] against 112 [89, 138] of 3,840). At the 75 ms law, slower than either
identification, every extra step of ceiling pays and every pooled neighbour pair is separated
(p ≤ 0.0002), down to 121 crashes of 768 at 200 ms; at ten seeds 200 ms crashes less than 150 ms
there in 20 of 20 pairs (217 against 462 of 1,280).

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
always-on tunes' fast rises came with 7–16 cm overshoots (`m7ae_cint_train/verdicts.txt`). That
frontier is not a limit of the loop. Adding a 1 m set-point step to the training objective as a fourth
condition, band on (milestone 7af), wins the rise back and more: median 1.41 against 1.83 s
(Mann-Whitney p = 3.7e-05), with crashes not separated (97 against 107 of 2,304, p = 0.84) and all
12 designs certified and settled. The tuner does it by lowering kd (median 4.65 against 6.52 s⁻¹).
Under the cap on the proportional request the vehicle cruises most of a 1 m step at about A_P/kd,
and over the 36 designs of 7ac, 7ae and 7af rise time follows kd with Spearman ρ = 0.999. The price is
overshoot, 4.7–5.3 cm against 1.1–1.8 cm, and up to 3.6% worse gust tracking
(`m7af_step_obj/verdicts.txt`).

**Rise time without flying (milestone 7ag).** The relation is mechanical, so it should not need fitting.
A one-dimensional point mass of the outer loop alone, x'' = −min(k_p|x|, A_P) sgn x − k_d x' + k_i I with
the integrator gated at b, integrated from rest at the step size S, has no free constant. Flying the same
36 designs again (no retraining) at A_P = 2, 2.5, 5 and 8 m/s² on a 1 m step and at S = 0.5 and 2 m with
A_P = 3.5, under all three identified laws (756 flights of 64 episodes), it predicts each design's median
rise within 0.10 s for 35–36 of 36 at A_P ≤ 5 and S ≥ 1 m, median error 0.002–0.040 s on rises of
0.8–4.6 s. The fitted line from 7af drifts by 0.11–0.14 s off its fitting point. Swapping the 33 and
39.1 ms motor laws moves no design's rise by more than 0.05 s. The model misses at S = 0.5 m (31 of 36)
and A_P = 8 (23 of 36), always with the vehicle faster and overshooting more than predicted. One
first-order lag on the achieved acceleration, fitted on the in-sample condition (135 ms, post hoc), brings
those to 36 and 33 of 36 (`m7ag_cruise/verdicts.txt`, `posthoc.txt`). The braking lean comes late, and the
shorter the step or the harder the cap, the more of the travel is braking.

**The lag, identified rather than fitted (milestone 7ah).** Fitting that lag on a position step uses the answer.
Flown instead with the outer loop open, from hover with the acceleration request stepped to 3.5 m/s², the
36 designs reach 63% of their steady acceleration in a median 182 ms (area estimate 171 ms), with no design
moving more than 10–15 ms between the three motor laws or between a 1 and a 3.5 m/s² step. With each design's
63% time the lagged point mass is within 0.10 s for 36 of 36 designs in all seven conditions (median error
0.017 s at A_P = 8, 0.011 s at S = 0.5 m), better than the fitted 135 ms, whose in-sample objective is flat
between about 130 and 200 ms; a single pooled lag does about as well (`m7ah_att_step/verdicts.txt`).

**The lag, computed rather than flown (milestone 7ai).** The same step response follows from the 11-state
linearisation of section VI with the position gains set to zero (`linstab.accel_step`), averaged over a 3×3×3
grid of the randomisation box. With no flight, its area estimate is within 10 ms of the flown one for 36 of 36
designs (median difference 0.5 ms) and its 63% time within 15 ms for 34 of 36; the lagged point mass given that
63% time is within 0.10 s for 36 of 36 designs in all seven conditions, never more than 0.0010 s worse in median
error than with the flown lag (`m7ai_lag_model/verdicts.txt`). Averaging over the box is part of the rule: at the
nominal plant alone the 63% time is within 15 ms for only 18 of 36. The early part of the response is the side
force: with it switched off the share of the request reached at 50 ms falls from a median 0.220 to 0.101, and the
63% time moves by more than 15 ms for 28 of 36 designs, so a lag measured on an uncanted frame does not carry over.
The steady acceleration above the request in milestone 7ah was the small-angle lean map (with arctan(a/g) the
median a<sub>ss</sub>/A is 1.015 at 1 m/s² and 1.017 at 3.5, against 1.062 with a/g) plus a slow ring of the loop
that the linear model reproduces within 0.01 for 36 of 36 designs.

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
not at a midpoint, and never draw faster plants than that. Set the ceiling at about 4× it:
at ten seeds per geometry, 150 ms (3.8×) crashes 43% less often than 125 ms (3.2×) at the identified
lags. It also crashes a third less often at the 75 ms law (462 against 695 of 1,280). It costs
0.39 s of rise time with the centre of pressure above and 0.10 s below (medians 2.08 against 1.68 s
and 1.83 against 1.73 s). Choose 125 ms only when rise time matters more than those crashes, and
200 ms (5.1×) when the motors may be slower than identified: at ten seeds it does not
detectably cut the crashes at the identified lags (86 against 112 of 3,840, p = 0.08) but halves them
at a 75 ms motor (217 against 462 of 1,280), for 4–7% more mass and 0.13–0.44 s more rise. Run the position integrator only within about a quarter of a step of the set
point; with that, the 125 ms tune has no unsettled designs. Put a set-point step in the tuning
objective: without one the tuner has no reason to rise fast. With a capped proportional term, compute
the rise time before flying from k_p, k_d, k_i, A_P and the step size with the point mass above (within
0.04 s for steps of 1 m or more and A_P up to about half of g tan of the tilt limit); for shorter steps or
harder caps, add one first-order acceleration lag equal to the 63% time of the attitude loop's acceleration
step, computed from the linearised loop averaged over the randomisation range (or read off one flown step).

**Figures.** Both are drawn by `paper/figures_vii.py` from the parsers that generate Table VII-1, so
figure and table cannot disagree. VII-a (`paper/fig_VIIa.png`): identified total and the 75 ms count
against the training ceiling, the 39.1 ms-floor sweep as one series and the intervals with ceiling
twice the floor as another (the 33–78.2 ms row is neither and is left out). The two series lie close to one
curve: at the identified lags what matters is the ceiling, not the floor, once the floor is not
below the slow identification. VII-b (`paper/fig_VIIb.png`): rise time against identified total for
the nine rows with a step test, the coverage frontier a builder picks a point on; 39.1–125 ms sits
on its knee.

## VIII. Limitations (full draft)

**One simulator for the position loop.** RotorPy re-scores attitude only (section V). The side force,
the feed-forward, the certificate and the randomisation results of sections VI and VII rest on the
stylised simulator alone, and the rise-time rule's lag is that simulator's own linearisation, so section
VII shows the simulator's lag can be computed, not that a real vehicle's can.

**Inherited inputs.** The mass, cost and motor fits of the sizing closure, the torque-scale and mass
ranges of the randomised plant (U(0.7, 1), U(0.9, 1.3)) and the gust model are assumptions carried over
from the earlier projects, not sourced values. Milestones 7p and 7q replace the closure with laws fitted
to listed frames and components for section VII only. RotorPy's aerodynamic coefficients are scaled to
each propeller by momentum-theory exponents. The motor lag is the only uncertain input whose
randomisation range was swept, and its ceilings are brackets, not sourced values.

**Seeds and tests.** Milestones 1, 2 and 4 use ten seeds, with exact Wilcoxon tests and bootstrap intervals in
sections IV and V (`m12_ten_seeds`), and so does section VI's Table VI-1 (`m12b_ten_seeds_vi`), whose ten seeds
showed two unconstrained tunes diverging at their trained tilt limit that six had not. Milestones 7c, 7d, 7g and 7s–7ac use six per arm, below the proposal's ten for paper figures;
section VII pools the two centre-of-pressure geometries to reach twelve, and its 125 and 150 ms rows have ten per
geometry (`m12c_ten_seeds_vii`), which separated a pair six seeds had not (p = 0.10 to 0.004). The five-seed reading of milestone 2
overstated cant's gain from the shared polytope (6.08° against 4.98° at ten seeds), a reminder that the six-seed
sections may move too. Every result in sections
VI and VII is scored on one held-out seed of 64 episodes per design.

**What was changed after the fact.** H5's top-ten rank test (section V) was replaced, after the run, by
arm-level agreement and all-design ρ against the self-agreement ceiling, because the top ten were tied
within episode noise. The 135 ms lag of milestone 7ag was fitted post hoc; milestones 7ah and 7ai
replaced it with an identified and then a computed lag, scored against rise times already published.

**The certificate.** The stability test checks the eight corners of the plant box, a sampled test
[bartlett1988]. It is necessary, not sufficient (section VI), and the 23 divergences in 640 at twice
the trained lever are a torque-authority limit no gain margin removes.

**No hardware.** Milestone 8, an owner step (printed motor mounts at 0° and at the co-designed angle, a load
cell and a yaw-rate log), is the test that would turn these findings into a builder's rule.

## IX. Conclusion (full draft)

On a small four-rotor X that must hold heading, a fixed motor cant of about 30–35° pays under every
attitude law we tried and survives a second simulator; pricing hover power changes the vehicle's size,
not the angle. Its cost is a side force. Cancel the steady part with an integrator feed-forward, keep the
tuner off the loop's stability boundary with an 11-state linear check at 0.8× the integral-gain ceiling,
and score the tune at the tilt limit the autopilot will fly. When the motor lag is known only from a
published identification, randomise it from the slowest identified value up to about 4× it, integrate the
position error only near the set point, and put a set-point step in the tuning objective; the rise time
of the resulting tune then follows from its gains and a lag computed from the linearised loop, before
it flies. The hardware check is next.

## Still to do before submission

- Ten seeds for the rest of section VII (100, 125, 150 and 200 ms have ten per geometry since 2026-11-22; 100→125 and 125→150 ms are separated at the identified lags, 150→200 ms is not, p = 0.08; 78.2 ms and the floor rows remain) and for milestones 7c, 7d and 7g of section VI (milestones 1, 2, 4 and 5 have ten since 2026-11-21, and Table VI-1 since 2026-11-22, with Wilcoxon tests and bootstrap intervals).
- Section VI: a figure for milestone 7g's authority result, and a whole-loop margin (spectral radius bound below 1).
- Section VII: the same coverage sweep on the torque-scale and mass ranges; a sweep of the
  set-point step's weight and size (milestone 7af used one of each) to map the reachable overshoot-rise frontier.
- LaTeX in the RA-L template, cut to 6 + 2 pages (the full draft is well over).
- Sections IV–V: retune the top designs inside RotorPy to separate model mismatch from overfitting (milestone 5's limit).
- Hardware check (milestone 8).
