# Does rotor cant still pay once a co-designed quadrotor must hold position?

Follow-up to `codesign-aero-cant-bound`, and five sibling READMEs that all defer the same step: "add position hold so lateral thrust components are tested". A canted rotor makes a sideways force whenever roll or pitch torque is commanded. Here the vehicle gets translation, an outer position loop and that force. Produced with AI assistance (Claude). **Simulated; the cost model, mass model, reaction-torque ratio, noise levels and plant ranges are inherited or assumed (marked in `src/.../aero.py`).**

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/codesign-aero-cant-poshold/

![Left: held-out position error of each co-designed vehicle; right: yaw error. One dot per seed.](experiments/poshold.png)

**Headline (simulated; numbers from `experiments/results.txt`).** Joint CMA-ES over arm length, propeller diameter, cant, six attitude gains and three position gains (3200 evaluations, 5 seeds), scored on 64 held-out wide-plant episodes (start up to 0.5 m off the origin in a gust, hold position while yaw steps ±30°):
- **The lateral force of a canted rotor is large enough to break a design that ignores it.** A closed form, F = τ·tan α / r (body force per unit roll/pitch torque, checked against an explicit four-rotor allocation in the tests), is added to the physical model. Designs tuned with the force switched off and then scored with it on have a mean position error of 1.08 m (cant ≤ 35°) and 1.17 m (≤ 80°), against 0.25 m and 0.22 m when the force is in the optimisation loop; worse in 5 of 5 paired seeds at both bounds.
- **The force costs position accuracy.** Re-scoring the force-aware designs with the force switched off improves them (J 3.33 to 2.61 at the 35° bound, 3.04 to 2.83 at 80°): the force is a disturbance the controller has to work around, not free authority. The sign comes from the layout: with this arm and spin assignment a positive roll torque pushes the vehicle the way a roll tilt would not (an unhelpful, non-minimum-phase-like axis) while pitch is the helpful axis.
- **Cant still buys yaw, not position.** Against no cant, paired by seed and scored with the physical model, yaw RMS falls 5.8° (bound 35°) and 6.0° (bound 80°), better in 5 of 5 seeds each, and position RMS is unchanged within noise (+0.03 m and 0.00 m). The combined score J = √((pos/0.1 m)² + (yaw/10°)²) improves by 0.18 and 0.48, better in 3 and 4 of 5 seeds: weak. Three seeds at the 35° bound and two at 80° land on the same ~2.42 optimum (about 0.145 m, 19.5°), against 2.90 for the best no-cant seed, but the others stop in worse local optima (one seed per cell is above 5): the optimiser budget, not the physics, limits the seed-to-seed spread.

## Method
`src/codesign_aero_cant_poshold/aero.py`: the earlier model (sizing closure, attitude dynamics, gust, wide plant randomisation) plus `rollout_pos`: world position and velocity, perfect altitude hold (vertical force balances weight; the small vertical part of the lateral force is neglected), wind drag force 0.5 ρ A v|v| from the same gust that drives the torque, and the body lateral force from the *actual* (lagged, saturated) roll/pitch torque. An outer PID on noisy position (σ 0.02 m) and velocity (σ 0.05 m/s) turns the position error into roll/pitch references (small-angle, rotated by measured yaw, clipped at 20°); an inner PID tracks them. `couple=False` switches only the lateral force off. `rotor_layout` is the explicit four-rotor allocation used by the tests to verify the closed form and the yaw authority of `size`. Experiment (`experiments/run.py`): bound ∈ {0°, 35°, 80°} × (force in or out of the design loop) × 5 seeds; each trained design is scored on held-out episodes with the force both on and off. Same cost cap ($300) and clearance rule as the parents. No LLM is used.

## Reproduce
```bash
cd research/codesign-aero-cant-poshold
PY=$(python3 ../../platform/ci/pyenv.py pytest numpy cma matplotlib)
"$PY" -m pytest -q tests          # 17 tests
"$PY" experiments/run.py          # a few minutes on 4 cores; results.txt, results.json
"$PY" experiments/figure.py       # experiments/poshold.png
```

## Limitations
- Episodes are 2 s long (the parents' length), enough for the initial offset and a few yaw steps but not for slow position drift; the objective weights (0.1 m ↔ 10°) are a choice, so the position and yaw parts are reported separately.
- Seven of the 25 trained designs sit well above the best (optimiser local optima at 3200 evaluations); means are therefore dominated by those seeds and per-seed values are given. The paired seed counts are small (5).
- One arm/spin layout; the lateral force is the linear closed form for a symmetric vehicle at hover (no airflow interaction, no loss from rotors fighting each other beyond the earlier tilt loss, no vertical part of the force). Altitude hold is perfect. Noise levels, the offset size and drag coefficient are assumed.
- Cost, mass, motor model, κ and plant ranges are inherited assumed fits. No hardware.

## Next steps
Longer episodes with a wind step to test position drift; a PX4 or other full-stack software-in-the-loop check of the sign of the lateral force on both axes; compare at equal cost with a larger propeller or a yaw-only motor upgrade; seed the optimiser from the best design to remove the local-optimum noise.

## Owner steps
Measure sideways thrust from a 3D-printed canted-arm quad on a load cell while commanding roll torque. Not done here.

## Builds on
`codesign-aero-cant-bound` (the model, the 35° plateau). Tilted-propeller multirotors: Rajappa, Ryll, Bülthoff and Franchi (2015), *IEEE ICRA*, pp. 4006–4013, doi:10.1109/ICRA.2015.7139759 (idea only; nothing is reproduced). CMA-ES: Hansen and Ostermeier (2001), *Evolutionary Computation* 9(2).

## Lab tags
RECUV and the Autonomous Systems IRT (UAV simulation, safe autonomy), as direction only; nothing is affiliated with or endorsed by them.

## Outside dependencies (vitamins)
numpy, cma, matplotlib. No model API is called.

MIT.
