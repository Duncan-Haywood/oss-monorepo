# A linear-drag twin of a quadratic-drag vehicle is right only near the speed it was fitted at, and its safe-speed error changes sign

## Question
Twins of vehicles and UAVs often model aerodynamic drag as linear in speed because it is easy to fit. If the real drag is quadratic, what does a linear twin get wrong about coasting, terminal speed and, most relevant for safe autonomy, the largest speed from which the vehicle can stop within a given distance? Does the answer depend on where the twin was fitted?

## Model
Truth: unit mass, `v' = −c v|v| + u`, `c = 0.05`. Coast-down (`u = 0`): `v(t) = v0/(1 + c v0 t)`, distance `ln(1 + c v0 t)/c`; it never stops. Thrust `F`: terminal speed `√(F/c)`. Braking `u = −B`: stopping distance `ln(1 + c v0²/B)/(2c)`, safe speed for a limit `D`: `v0² = (B/c)(e^{2cD} − 1)`. Twin: `v' = −k v + u`; coast-down `v0 e^{−kt}`, terminal speed `F/k`, stopping distance `(1/k)(v0 − (B/k) ln(1 + k v0/B))`, safe speed by bisection. Matching the drag force at a fit speed `v_f` gives `k = c v_f`. Closed forms checked against RK4 (`tests/`); pure Python.

## Results
(all numbers from `experiments/results.txt`)
1. **Coast-down time to `v0/10` is independent of `v0` in the twin** (`ln 10/k`, 9.21 s at `k = 0.25`) but `9/(c v0)` in truth (180, 72, 36, 18, 9 s at `v0` = 1, 2.5, 5, 10, 20). Twin/real = 0.051, 0.128, 0.256, 0.512, 1.023: equal to `(ln 10/9)·v0/v_f`, exact only at `v0 ≈ 3.9 v_f`. The real vehicle never stops; its coast distance diverges logarithmically, whereas the twin stops within `v0/k`.
2. **Terminal speed** at `F = 5` (real 10.0) is `F/(c v_f)`, ratio `v_term/v_f`: 100, 20, 10, 6.67, 5 for `v_f` = 1, 5, 10, 15, 20.
3. **A least-squares fit over a speed range has a built-in crossover.** For speeds uniform on `[0, vmax]`, `k = 3c·vmax/4` (tested numerically), so twin/real drag is `0.75·vmax/v`: 7.5 at `0.1·vmax`, 3.0 at `0.25·vmax`, 1.0 at `0.75·vmax`, 0.75 at `vmax`, 0.5 at `1.5·vmax`.
4. **Safe speed under a stopping limit changes sign with the fit speed.** `D = 10 m`, `B = 4`, real safe speed 11.724 m/s. Twin safe speed 9.281, 9.623, 10.683, 12.546, 16.545 m/s for `v_f` = 1, 2, 5, 10, 20 (−20.8%, −17.9%, −8.9%, +7.0%, +41.1%). At `v_f = 20` the real vehicle needs 14.87 m from the twin's "safe" speed against a 10 m limit. A frictionless twin gives 8.944 (`√(2BD)`). Fitting at low speed is conservative for this question and fitting at high speed is not: whether a twin errs on the safe side depends on the question and the fit speed, not on the twin alone.
5. **Stopping-distance error grows with speed above the fit.** Twin matched at 5 m/s: −5.3%, −4.5%, +10.1%, +32.0%, +56.8%, +109.2% at `v0` = 2, 5, 10, 15, 20, 30 (real 0.488 to 25.06 m).
6. **A trace-fitted `k` depends on the trace.** Least-squares `k` from a coast-down at `v0 = 10` with `c = 0.05`: 0.382, 0.309, 0.258, 0.229, 0.223 for trace length 2, 5, 10, 20, 40 s, against the force-matched 0.5 at `v0` and 0.25 at `v0/2`: long traces are dominated by the slow tail (mean speed 6.95 down to 1.53), so their `k` transfers badly to high-speed braking. Measurement noise (σ = 0.2, 200 seeds, T = 10) has a sd of 0.0014 on a mean 0.2583 (0.5%); the noiseless value is 0.2583: the model error, not the noise, dominates.

## Limitations
One-dimensional, pure quadratic drag with no linear or constant (rolling) component, constant brake force, no actuator lag, noiseless closed-form truth, one value of `c`, one brake level and one distance. The real vehicle's drag need not be pure quadratic (Reynolds-number dependence, ground effect, propeller inflow), so these are error laws for the model class, not field predictions. The fit-speed trade-off in result 4 would depend on the drag exponent. No claim is made about other linear-twin fitting schemes (e.g. weighted or nonlinear in `k`).

## Next steps
Fit both linear and quadratic terms and measure the excess data needed to tell them apart; drag plus rolling friction and the speed at which each dominates; wind and relative-airspeed effects; UAV energy-per-distance `c v²` versus `k v` and its optimal cruise speed (see `uav-energy-twin`); safe-speed certification with a fitted-range guard (refuse to extrapolate beyond `vmax`); combination with `latency-twin` and `lag-twin` in this repository.

## References
- Anderson, J. D. (2016). *Fundamentals of Aerodynamics*, 6th ed. McGraw-Hill.
- Khalil, H. K. (2002). *Nonlinear Systems*, 3rd ed. Prentice Hall.
- Ljung, L. (1999). *System Identification: Theory for the User*, 2nd ed. Prentice Hall.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
