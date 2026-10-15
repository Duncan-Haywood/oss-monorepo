# A twin with no gravity certifies every PD gain: sag, loss of the upright hold, and feedforward mis-calibration

*Stylised: a single pendulum joint under PD control, pure Python, every number is from `experiments/results.txt` (deterministic, about 10 s). The "real" system is itself simulated; no lab or field data. Negative and out-of-model results are marked.*

## Question
Manipulator and legged-robot twins are often built gravity-free for speed, or with a gravity model that is slightly off. A PD gain tuned in such a twin is certified stable with zero steady-state error. What does the same gain do on a plant with gravity?

## Model
Real: `θ'' = −g sin θ + kp(θ* − θ) − kd θ' + ĝ sin θ*` (g = 1; `ĝ` is an optional feedforward). Twin: `g = 0`, `ĝ = 0`: `s² + kd s + kp`, stable for all positive gains, zero error. Real equilibria are roots of `F(θ) = kp(θ* − θ) + ĝ sin θ* − g sin θ`, all inside `|θ* − θ| ≤ (g + |ĝ|)/kp`; one is stable iff `kp + g cos θ_e > 0`. Damping comes from the twin's rule `kd = 2ζ√kp`, ζ = 0.7, except in sections 3–4 where it is fixed as stated.

## Results
1. **Sag.** At `kp = 4` the real hold settles to the nearest root, not the target: sag 0.0200, 0.0979, 0.1824, 0.2382, 0.2458, 0.1837 rad for `θ*` = 0.1, 0.5, 1, 1.5, 2, 2.5 against a twin error of 0. RK4 to T = 80 agrees with the root to six digits in every case. The first-order formula `(g−ĝ) sin θ*/(kp + g cos θ*)` is within 2% for `θ*` ≤ 1 and 3% at `θ*` = 1.5–2.
2. **Gain is a slow cure.** At `θ* = 1` the sag is 0.489, 0.316, 0.182, 0.080, 0.0208, 0.0084 rad for `kp` = 1, 2, 4, 10, 40, 100: roughly `1/kp`, so a 1% position error needs `kp ≈ 80 g`, which the twin never asks for.
3. **Upright hold threshold.** For `θ* = π` the upright equilibrium is stable iff `kp > g`. At `kp/g` = 0.5, 0.9, 0.99 there is no stable upright equilibrium and the arm settles at 1.25 or 5.04, 2.35 or 3.93, 2.90 or 3.39 rad (the simulation started 0.05 rad from upright ended at π − 1.90, π − 0.79, π − 0.24). At 1.01 and above it holds (final error 0.0028 at 1.01, slow because the rate vanishes at the threshold). The twin certified all of these.
4. **Shrinking basin (nonlinear).** With `kd = 2`, the first start distance (at rest, either side) that fails to converge is 0.116 rad at `kp/g = 1.02`, 0.519 at 1.05, and none below 3 rad (the scan limit) from 1.1 up. The basin collapses only very near the threshold; it is a scan with bisection, not a proof of the basin boundary, and it need not be an interval.
5. **Mis-calibrated feedforward.** With `ĝ sin θ*` and `kp = 4`, `θ* = 1`, the residual sag is 0.0919, 0.0369, 0.0185, 0, −0.0186, −0.0372, −0.0935 rad for `ĝ/g` = 0.5, 0.8, 0.9, 1, 1.1, 1.2, 1.5: linear in the error (formula within 1%) and sign-symmetric, so a 10% gravity error costs about a tenth of the uncompensated sag. Feedforward at the target does not protect the `kp > g` condition.

## Limitations
One joint, rigid, no friction (see `friction-twin`, `stiction-twin`), no flexibility (`flex-twin`), no actuator lag or limits (`lag-twin`, `slew-twin`, `saturation-twin`), noiseless, no integral action (an integrator removes the sag but adds its own stability bound, not studied here), constant feedforward rather than θ-dependent gravity compensation. The "real" plant is the same family as the twin apart from gravity, so model-form error is not tested. The basin result is numerical and the threshold `kp > g` is local linear stability.

## Next steps
Identify `g` from logged static poses and quantify the data needed for a given sag; PID and computed-torque compensation and their stability bounds; multi-link coupling of gravity torques; a twin whose gravity is right but whose payload mass is wrong.

## References
- Takegaki, M. & Arimoto, S. (1981). A new feedback method for dynamic control of manipulators. *ASME J. Dynamic Systems, Measurement, and Control* 103(2).
- Spong, M. W., Hutchinson, S. & Vidyasagar, M. (2006). *Robot Modeling and Control*. Wiley.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
