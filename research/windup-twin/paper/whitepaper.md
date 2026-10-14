# A twin with an unlimited actuator is exact until the command limit, then integrator windup makes step size matter

*Stylised: a PI loop on a single integrator, pure Python, every number is from `experiments/results.txt` (deterministic, about 35 s). The "real" system is itself simulated; no lab or field data. Negative and out-of-model results are marked.*

## Question
Digital twins often give the actuator unlimited authority and omit constant loads. A PI loop tuned and validated in such a twin has a step response independent of step size. When does a real actuator with command limit `U` and load `d` break that, and what does the twin's "faster is better" advice cost?

## Model
Real: `x' = sat_U(u) + d`, `u = −kp x − ki z`, `z' = x`, `kp = 2ζωn`, `ki = ωn²`, `x(0) = x0`, `z(0) = 0` (RK4, dt = 2·10⁻³, smaller for ωn > 1). Twin: `U = ∞`, `d = 0`; linear, so the normalised response is independent of `x0` (overshoot 21.03% and 2% settling time 4.882 at ζ = 0.7, ωn = 1, including the PI zero). "Clamped" is conditional integration: `z` is frozen while `u` is saturated and the integrator would drive it further out.

## Results
1. **Validity region.** The largest twin command is `kp x0`, so the twin is exact iff `kp x0 ≤ U`. At ζ = 0.7, ωn = 1 (kp = 1.4) the maximum deviation over x0/U = 0.1, 0.5, 0.7 is exactly 0; it is 6.4·10⁻⁵ (relative to x0) at 0.72, 0.012 at 0.8, 0.084 at 1.0, 0.29 at 1.5, 0.44 at 2.0. A step test with amplitude below `U/kp = 0.714` certifies the twin perfectly and says nothing about the cliff just beyond.
2. **Windup.** While saturated `x = x0 − Ut` and `z = x0 t − Ut²/2`, so `z` peaks at exactly `x0²/(2U)` when `x0² ≥ 2U²/ki` (here x0 ≥ 1.41): measured peaks 2.000, 12.500, 50.000, 200.000, 1250.000 at x0 = 2, 5, 10, 20, 50. The exit from saturation (`kp x + ki z = U`, a quadratic) matches simulation: exit time 2.58997 / 8.59600 / 18.59800 against 2.59000 / 8.59600 / 18.59800, integrator at exit 1.82596 / 6.03440 / 13.03720 against 1.82595 / 6.03439 / 13.03720. Consequences: overshoot (fraction of x0) 0.211 (x0 = 0.5, same as the twin), 0.237 (1), 0.449 (2), 0.741 (5), 0.865 (10), 0.931 (20), 0.972 (50); settling time 4.88, 4.97, 7.97, 16.7, 48.6, 164.6, 944.5 against the twin's constant 4.88. The real response overshoots by nearly the whole step.
3. **Load.** With x0 = 5, settling time is 16.70, 25.04, 54.66, 105.1, 214.0, 1063.7 for d/U = 0, 0.5, 0.8, 0.9, 0.95, 0.99 (roughly `∝ 1/(U−d)` at the high end: it roughly doubles each time the remaining authority `U−d` halves, 105 → 214 from d/U = 0.9 to 0.95; this scaling is an observation, not derived) and the loop never settles for d/U = 1, 1.05 (x(T) = 5 and 205: it drifts at rate `d − U`). The twin has no load and promises 4.88.
4. **Faster is not better.** At x0 = 5, ζ = 0.7 and ωn = 0.25, 0.5, 1, 2, 4, 8 the twin's settling times are 19.5, 9.76, 4.88, 2.44, 1.22, 0.61; the real ones are 20.7, 18.5, 16.7, 24.3, 41.1, 76.6 with overshoot 0.29, 0.53, 0.74, 0.87, 0.93, 0.97. On this coarse grid the real optimum is near ωn = 1; beyond it each doubling of the twin-tuned bandwidth roughly doubles the real settling time, because the windup `ki x0²/(2U)` grows as ωn².
5. **Clamping.** Conditional integration holds the peak integrator at 0.328 for every x0 ≥ 1 and gives overshoot 0.150, 0.075, 0.030, 0.015, 0.0075, 0.0030 (x0 = 1, 2, 5, 10, 20, 50) and settling times 5.0, 5.5, 7.6, 9.9, 19.6, 49.0; at x0 = 5 and ωn = 2, 4, 8 it settles in 4.97, 4.91, 4.90, about `x0/U`, the speed limit of the actuator itself. Clamping fixes the windup but the twin's prediction (0.61 at ωn = 8) is still unreachable: no controller beats `x0/U`.

## Limitations
One integrator plant with a static symmetric limit, noiseless, continuous-time, exact PI structure; the real plant differs from the twin only by `U` and `d`, so model-form error is untested. Conditional integration is one anti-windup scheme (not back-calculation, not optimal); the gain grid in result 4 is coarse and the optimum near ωn = 1 is not located precisely. Global stability of the saturated PI loop was not proved (for d < U all runs settled, which is evidence, not proof); the `1/(U−d)` scaling is empirical. Not evidence about a particular actuator.

## Next steps
Higher-order plants (windup with lag or flex: combine with `lag-twin`, `flex-twin`); rate limits (`slew-twin`); identifying `U` and `d` from logs and the data needed to certify a step-size range; anti-windup gains by back-calculation; windup in a multi-axis workcell with shared power limits.

## References
- Åström, K. J. & Murray, R. M. (2008). *Feedback Systems: An Introduction for Scientists and Engineers*. Princeton University Press.
- Åström, K. J. & Rundqwist, L. (1989). Integrator windup and how to avoid it. *American Control Conference*.
- Khalil, H. K. (2002). *Nonlinear Systems*, 3rd ed. Prentice Hall.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
