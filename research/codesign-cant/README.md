# When does rotor cant pay on a small quadrotor co-designed with its motors and controller?

Research programme `codesign-cant` (track 14, `codesign`; proposal: [`PROPOSAL.md`](PROPOSAL.md), log: [`LOG.md`](LOG.md)). It gathers seven earlier single-step projects on canted-rotor quadrotors (`codesign-aero-cant`, `-bound`, `-kappa`, `-propdata`, `-twr`, `-twrceil`, `-poshold`) into one question aimed at *IEEE RA-L*. Produced with AI assistance (Claude). **Simulated. The propeller torque ratio c comes from measured UIUC data; the mass, cost and motor fits, the plant ranges and the gust model are inherited assumptions.**

**Live page:** https://marisstella.app/research/codesign-cant/

![Left: held-out RMS position error of the co-designed vehicles in 6 s position-hold episodes with a wind step, with the canted rotor's side force on (blue) and switched off as an ablation (grey). Middle: RMS yaw error during the same episodes. Right: position RMS with the side force on divided by off, for the gust torque sign the designs were trained under (blue) and flipped (red); the dashed line is H3's 20% refutation line.](experiments/m6_poshold/m6_poshold.png)

## Milestone 6: does a canted rotor's side force cost position hold? (H3)

**Question.** When the mixer makes roll or pitch torque on a canted quadrotor, the tangential thrust components stop cancelling and push the body sideways. Does that force cost position-hold accuracy by more than cant's yaw gain is worth? (H3 is refuted if position RMS rises by more than 20% with the force on.)

**Headline (`experiments/m6_poshold/results.txt` and `dist_sign.txt`; simulated, 6 seeds, best of two CMA-ES starts, 12 parameters, attitude-priority mixer, TWR 2, 6 s episodes in which the mean wind steps by ±3 m/s at 3 s).**

- **The side force, derived from the allocation:** F_y = lat·τ_x and F_x = lat·τ_y with lat = sin α / (L cos α − κ sin α). Yaw torque makes none. Tests check this against the full wrench map on 100 random designs. The `-poshold` project's tan α / (L/√2) was √2 too large.
- **H3's verdict depends on where the centre of pressure sits.** In the inherited model the gust's disturbance torque has a sign that makes the attitude loop's counter-torque produce a side force *against* the drag. There the force does not cost position: 0.96× with it on against off (one seed of six at 1.24×), and 0.71× after the wind step. Re-scored with that sign flipped, the same designs lose **1.21×** (all six seeds 1.18–1.24×) and 1.62× after the step: refuted by the proposal's own line, though without retraining.
- **Cant still buys yaw, not position.** Against no cant, cant cuts yaw RMS by 4.7° in 6 of 6 seeds (14.9° to 10.2°). Position is +0.03 m (4 of 6 seeds lower, one outlier carries the mean). The composite improves in 4 of 6 seeds as trained and 6 of 6 with the sign flipped. The yaw gain outweighs the position cost either way.
- **Ignoring the force in design costs less than `-poshold` found.** Designs trained with the force off are worse by 0.35 in the composite (2 of 6 seeds better), not the 1.07 m blow-up of the earlier study. They do lose 1.59× in position once the sign is flipped.
- **The co-designed cant does not move:** 36–38° (median 38°), as in milestones 2 and 4.
- Committed predictions: 5 of 7 held. Q2 (ignoring the force hurts in 5 of 6 seeds) and Q7 (the wind step costs at least 10% in every arm) were refuted.

![Left: held-out RMS attitude error of the co-designed vehicles for three attitude laws (PID, INDI, geometric SO(3)), without cant (grey) and with cant up to 80° (blue), 10 seeds each. Right: cant minus no cant, paired by seed, at the design gusts (blue) and at twice the gust intensity (red); below zero cant is better.](experiments/m4_controllers/m4_controllers.png)

## Milestone 4: is cant just a patch for a weak controller? INDI and geometric attitude control

**Question.** Every earlier result used one per-axis PID law. Does a stronger attitude law, incremental nonlinear dynamic inversion (INDI, Smeur et al. 2016) or geometric control on SO(3) (Lee et al. 2010), shrink or remove the advantage of rotor cant? (Hypothesis H4: it narrows but does not remove it; refuted if INDI without cant matches PID with cant.)

**Headline (`experiments/m4_controllers/results.txt`; simulated, 10 seeds per arm, three CMA-ES starts each, attitude-priority mixer, TWR 2, hover power priced at 0.3° per 100 W).**

- **Cant survives a stronger controller.** Paired by seed, cant beats no cant by **4.18°** RMS under INDI (SD 0.25), **4.88°** under geometric control (SD 0.20) and 5.27° under PID (SD 1.32), in 10 of 10 seeds for every law (sign test p = 0.002).
- **H4 passes its refutation test.** INDI without cant is 4.02° worse than PID with cant in 10 of 10 seeds. Without cant the mixer still scales yaw on 54–60% of steps whatever the law: no controller makes yaw torque the rotors cannot.
- **The stronger law narrows the gap a little.** INDI shrinks the cant advantage by 1.09° against PID (9 of 10 seeds), geometric control by 0.38° (5 of 10).
- **INDI mostly buys consistency for the uncanted vehicle.** PID without cant ranges 17.2–21.1° across seeds, INDI 16.9–17.6°. At twice the gust intensity INDI beats PID by 5.4° without cant and by 0.05° with it, so about half of PID's 9.8° gust-time cant advantage is a controller effect; the remaining 4.5° is the actuator.
- **The co-designed cant does not depend on the law:** median 34° (PID), 34° (INDI), 35° (geometric).
- All eight predictions committed to `LOG.md` before the run held, and the PID arms reproduce milestone 2 exactly.

![Left: held-out RMS error against hover power for every milestone-2 vehicle (grey: per-axis torque box; blue: attitude-priority mixer on the shared thrust polytope; orange: the same with airmode). Right: chosen cant as hover power is priced; crosses are the best of three CMA-ES starts.](experiments/m2_polytope/m2_polytope.png)

## Milestone 2: one thrust polytope for combined commands, and a price on hover power

**Question.** Milestone 1 let roll, pitch and yaw each saturate at their own limit at once, and left hover power free. Does cant still pay when the three torques share one thrust budget through a real mixer, and when power costs something?

**Headline (`experiments/m2_polytope/results.txt` and `restarts.txt`; simulated, 5 seeds, TWR 2).**

- **The shared polytope costs accuracy, and cant more than makes up for it.** With an attitude-priority mixer (roll and pitch first, yaw gets the rest, as PX4 and Betaflight do) held-out RMS error rises by 2.90° without cant and 1.63° with it (5 of 5 seeds each). Cant's paired advantage grows from 4.81° to **6.08°** (SD 0.28, 5 of 5). The tuned no-cant vehicle saturates roll and pitch on 97% of steps, leaving yaw nothing; with cant, yaw rides on the tangential thrust and is scaled on 39% of steps.
- **Pricing hover power shrinks the vehicle, not the cant.** At 0.3° per 100 W, hover power falls 4–7× (canted design 1380 W to 219–256 W) for at most 0.5° of extra error. The chosen cant stays at **28–37° in 9 of 10 seed-arms** from 0 to 1° per 100 W (best of three CMA-ES starts). The proposal's H1, a small 5–20° optimum, is refuted under this objective.
- **Cant still wins once power is priced:** −5.28 composite at 0.3° per 100 W (5 of 5) and −2.92 at 1° per 100 W (4 of 5).
- **Single-start CMA-ES is unreliable on the polytope.** One start per seed sent 2 of 5 seeds to 0–13° of cant at 0.3° per 100 W, with scores 4–6° worse; restarts recovered 32–37°. The no-cant landscape is multimodal too (restarts moved it 0.6° at 1° per 100 W).
- **Airmode helps** (collective free): −1.56° without cant (5 of 5), −0.26° with it (4 of 5).

## Milestone 1: the earlier actuator model, checked against a full allocation

**Question.** All seven earlier projects gave the simulator two hand-written torque limits. Are they right, and do the conclusions survive if they are not?

**Headline (numbers from `experiments/m1_allocation/results.txt`; simulated, 5 seeds).**

- **The formulas were wrong in three places.** The full 6×4 thrust-to-wrench map with every thrust in [0, Tmax], maximised by a linear programme (closed forms agree to 1e-15 on 300 random designs), gives yaw 4Δ(L sin α + κ cos α) and roll 4Δ(L cos α − κ sin α)/√2, where Δ = min(Th, Tmax − Th) with altitude held, or Tmax/2 if the mixer may give up altitude. The earlier yaw limit used 2 in place of 4 and the moment arm L/√2 in place of L, which understated yaw authority by 2× with no cant and up to 2.8× with cant. The earlier roll limit kept growing above TWR 2 by assuming negative rotor thrust. The side force per unit roll torque in `-poshold` was √2 too large.
- **Cant's advantage survives the correction.** Paired by seed, cant ≤ 35° beats no cant by 4.81° RMS (SD 0.12, 5 of 5 seeds) with corrected limits at TWR 2, against 4.62° with the old ones. With TWR free the gap is 4.81° (altitude held) or 2.77° (collective free), against 2.43° before.
- **The chosen cant does not move.** 35–37° at an 80° bound, the same plateau as before. That plateau comes from the objective: attitude error only, with cost as a $300 cap. The 35° design weighs 3.17 kg against 1.74 kg without cant and needs cos(35°)^−1.5 = 1.35× the ideal hover power. Naming a best cant angle needs an objective that prices energy.
- **The motor-headroom result does not survive.** `-twrceil`'s interior optimum near TWR 5 depended on the roll limit growing past TWR 2. With altitude held the optimiser picks TWR 2.0–2.3; with collective free it picks 3.3–4.7.
- The earlier numbers are reproduced exactly when the old limits are switched back on (13.65° and 11.22° for twrceil, 17.06° and 12.46° for propdata).

## Method

**Milestone 6.** `src/codesign_cant/poshold.py` adds translation to the attitude model: perfect altitude hold, drag from the same gust that drives the disturbance torque, GNSS-class position and velocity noise, an outer PID that sets roll and pitch references, and the side force from the delivered (mixed, lagged, saturated) torque. All of these are inherited from `codesign-aero-cant-poshold` and assumed. Joint CMA-ES runs over arm, propeller, cant, six attitude and three position gains, with 3200 evaluations on 16 training episodes. J = −sqrt((pos/0.10 m)² + (yaw/10°)²) − 0.03·P_hover/100 W, which is milestone 4's power price in composite units. Each design is held-out scored on 64 episodes with the force on, off and in calm air. `dist_sign.py` re-scores the same designs with the gust torque's sign flipped.

**Milestone 4.** `aero.rollout(ctrl=...)` adds two attitude laws next to the PID law; all three read the same noisy, one-step-old angles and rates and send their torque request through the same mixer. `indi`: an attitude P loop gives a rate demand, a rate P loop gives a desired angular acceleration ν, and the torque command is the filtered estimate of the delivered torque plus g·I_nom·(ν − filtered angular acceleration); the estimate runs the command through the design's nominal lag and limits, so the plant's randomised torque scale, inertia and lag stay unknown to it; gyro and estimate share a tuned two-pole filter. `geo`: τ = I_nom(−k_R e_R − k_Ω Ω − k_I ∫e_R) + Ω × I_nom Ω with e_R = vee(R_dᵀR − RᵀR_d)/2. Each law has six tuned parameters, searched jointly with arm, propeller and cant. `experiments/m4_controllers/run.py` runs law {PID, INDI, geo} × cant bound {0, 80°}, 10 seeds, three CMA-ES starts (cant started at 4, 32, 64°), 1920 evaluations each, best training score kept (180 runs), and scores the chosen designs on 64 held-out episodes and at twice the gust intensity. Tests (`tests/test_controllers.py`) check the rotation and SO(3) error against closed forms, the gain maps, step tracking on the nominal plant and INDI's disturbance rejection.

**Milestone 2.** `allocation.mix_priority` uses the fact that the roll, pitch, yaw and Fz rows of the canted-X wrench map are orthogonal sign patterns. It computes the thrust change for a request, then the largest scales for roll and pitch together and then for yaw that keep every thrust in [0, Tmax] (collective held at hover) or the thrust spread within Tmax (airmode). Tests check it against the vector-built `layout`, the thrust bounds and maximality. `aero.score(mixer=..., lam=...)` scores J = −RMS − λ·P_hover/100 W, with P_hover the sizing closure's electrical hover power. `experiments/m2_polytope/run.py` runs mixer {box, prio} × cant bound {0, 80°} × λ {0, 0.1, 0.3, 1}, plus airmode, with milestone 1's search (100 CMA-ES runs). `restarts.py` reruns the polytope arms at λ 0.3 and 1 with three starts per seed. Predictions for both were committed to `LOG.md` before each ran. Q1–Q3 and Q5–Q7 held; Q4 and H1 were refuted; the restart prediction R1 held for the angle but not for a 5-of-5 win, and R2 was refuted.

**Milestone 1.** 
`src/codesign_cant/allocation.py` builds the wrench map from vectors (rotor positions, canted thrust axes, spin-signed reaction torque). It solves the largest pure roll, pitch and yaw torque as a linear programme (`scipy.optimize.linprog`, HiGHS), with no net side force and the other torques at zero, and gives the closed forms the tests check against it. `src/codesign_cant/aero.py` is `codesign-aero-cant-twrceil`'s simulator, unchanged except for an `actuator` switch (`prior`, `hover`, `free`) that sets the two torque limits. `experiments/m1_allocation/run.py` reruns joint CMA-ES over arm length, propeller diameter, cant, optional TWR and six PID gains: 1920 evaluations, 5 seeds, 16 training and 64 held-out wide-plant episodes, $300 cap, κ = c·D with c = 0.081, the median of 77 measured UIUC propellers. The predictions in `LOG.md` were committed before the run. P1, P4 and P6 held; P2, P3 and P5 were refuted.

## Reproduce

```bash
cd research/codesign-cant
PY=$(python3 ../../platform/ci/pyenv.py pytest numpy scipy cma matplotlib)
"$PY" -m pytest -q tests                        # 27 tests
"$PY" experiments/m1_allocation/run.py          # about 9 minutes on 4 cores; results.txt, results.json
"$PY" experiments/m1_allocation/figure.py       # m1_allocation.png
"$PY" experiments/m2_polytope/run.py            # about 20 minutes on 4 cores
"$PY" experiments/m2_polytope/restarts.py       # about 16 minutes on 4 cores
"$PY" experiments/m2_polytope/figure.py         # m2_polytope.png
"$PY" experiments/m4_controllers/run.py         # about 45 minutes on 4 cores
"$PY" experiments/m4_controllers/figure.py      # m4_controllers.png
"$PY" experiments/m6_poshold/run.py             # about 55 minutes on 4 cores
"$PY" experiments/m6_poshold/dist_sign.py       # under a minute; post-hoc sign check
"$PY" experiments/m6_poshold/figure.py          # m6_poshold.png
```

## Limitations

- Milestone 1's arms use a per-axis torque box. Milestone 2's polytope mixer has TWR fixed at 2, where a hover-held mixer has the least room. The power price λ is a modelling choice, swept from 0 to 1° per 100 W, not a measured mission value.
- Under the polytope mixer the search landscape is multimodal, so single-start results are unreliable. Three starts were used only for four arms.
- Milestone 4 uses one power price and TWR 2; its INDI has no adaptive effectiveness estimation, and the geometric law no feed-forward (the references are steps).
- Milestone 6's translation model (drag, noise, perfect altitude hold, one wind state driving both the drag and the disturbance torque) is inherited and assumed. The centre-of-pressure sign that decides H3 has not been derived for a real frame, and the designs were not retrained under the flipped sign. Six seeds, two starts.
- Attitude steps only (milestones 1–4), 2 s episodes, five seeds (ten in milestone 4), one κ. The mass, cost and motor fits and the plant ranges are inherited assumptions, not catalogue data. No hardware.

## Next steps

Milestone 6 follow-up: retrain under the flipped gust-torque sign and sweep the centre-of-pressure lever. Then derive which sign a real frame has. Milestone 3: motor catalogue data replacing the inherited fits, with TWR free under the polytope mixer. It needs a source this session could not reach (T-Motor's thrust tables are images and its store blocks the proxy); a transcription of a dozen datasheets with the source of each row would unblock it. Then a RotorPy check of the top designs (milestone 5) and the paper draft (milestone 7) (`PROPOSAL.md`, "Milestones").

## Owner steps

Print canted motor mounts at 0° and about 32° for one frame. Then log yaw step response, and measure side force on a load cell while roll torque is commanded. Not done here.

## Builds on

The seven `codesign-aero-cant*` projects. Attitude laws: Smeur, Chu and de Croon (2016), *JGCD* 39(3), doi:10.2514/1.G001490; Lee, Leok and McClamroch (2010), IEEE CDC, doi:10.1109/CDC.2010.5717652. Allocation theory: Johansen and Fossen (2013), *Automatica* 49(5), doi:10.1016/j.automatica.2013.01.035; Crowther et al. (2011), *JGCD* 34(4), doi:10.2514/1.51186. Propeller data: Brandt and Selig (2011), AIAA 2011-1255, doi:10.2514/6.2011-1255. CMA-ES: Hansen and Ostermeier (2001), *Evolutionary Computation* 9(2), doi:10.1162/106365601750190398. The full related work is in `PROPOSAL.md`.

## Lab tags

RECUV and the Autonomous Systems IRT (UAV simulation, safe autonomy), as a direction only. Nothing here is affiliated with or endorsed by them.

## Outside dependencies (vitamins)

numpy, scipy, cma, matplotlib. No model API is called. `data/propdata_c.csv` holds derived per-propeller ratios from the UIUC Propeller Data Site (copied from `codesign-aero-cant-propdata`).

MIT.
