# A zero-wind twin of a UAV round trip cannot be fixed by averaging: wind costs energy at second order, shifts the best airspeed, and a one-leg calibration errs at first order with the sign of the leg

## Question
Twins of UAV missions are often validated on a leg and then used to plan an out-and-back sortie, on the intuition that a headwind out is repaid by a tailwind back. Is that true for energy, and what does it do to the choice of cruise airspeed and to a twin calibrated on only one leg?

## Model
Distance `D = 1` each way, constant airspeed `v` in units of `V0` (the zero-wind minimum-energy-per-distance speed), power `P(v) = (v³ + 1/v)/2` (parasitic plus induced), steady along-track wind `w` (headwind out, tailwind back). Ground speeds `v−w` and `v+w`; energy of a leg is `D·P(v)/ground speed`. Real round trip `E = 2P(v)v/(v²−w²) = (v⁴+1)/(v²−w²)`, infinite if `|w| ≥ v`. Zero-wind twin `2P(v)/v`. One-leg twin: calibrated on a leg with effective wind `w_c` and assumed to see it both ways, `2P(v)/(v−w_c)`. Closed forms checked against a time-stepped simulation (`tests/`, `experiments/`); pure Python.

## Results
(all numbers from `experiments/results.txt`)
1. **Wind does not cancel.** Real/twin energy is `1/(1−(w/v)²)` (harmonic, not arithmetic, mean of the ground speeds): 1.042, 1.099, 1.333, 1.961, 5.263 at `w/v` = 0.2, 0.3, 0.5, 0.7, 0.9, identical for either sign of `w`. The battery margin the twin's plan lacks is `(w/v)²/(1−(w/v)²)`. The simulation agrees with the closed form to 3×10⁻⁴ relative at `dt = 10⁻⁴` (2.8316 vs 2.8314 at `v = 1.4, w = 0.5`).
2. **The best airspeed moves and the twin cannot see it.** The twin minimises `v² + v⁻²` at `v = 1` for any wind. The real optimum solves `u² − 2w²u − 1 = 0` with `u = v²`: `v* =` 1.020, 1.083, 1.193, 1.352, 1.500 at `w` = 0.2, 0.4, 0.6, 0.8, 0.95. Flying the twin-optimal `v = 1` costs 0.08%, 1.5%, 9.8%, 52%, 356% more than the real optimum at those winds; at `w ≥ 1` it never returns. The regret is small for light wind and explodes near the stall.
3. **A one-leg calibration is wrong at first order.** Real vs the prediction of a twin that saw a headwind leg (or tailwind leg) and assumes the same wind back: ratio exactly `1 + w/v` (or `1 − w/v`). At `v = 1.5`, `w = 0.5`: 4.042 and 2.021 against the real 3.031 (+33.3%, −33.3%); at `w = 1.0`, +66.7% and −66.7%. So whether a leg-calibrated twin is pessimistic or optimistic depends on which leg happened to be flown, while the zero-wind twin is always optimistic but only by `(w/v)²`.
4. **Stall under random wind.** If the day's wind is uniform on `[−a, a]` and the plan flies airspeed `v`, the probability that `|w| ≥ v` (no return) is `1 − v/a`: 0.33 at `v = 1, a = 1.5`; 0.25 at `v = 1.5, a = 2`.

## Limitations
Steady, uniform, along-track wind; no crosswind (which adds a crab angle and would make the asymmetry larger for a fixed heading), no gusts, no vertical wind, no altitude dependence of the wind or of `P`; constant airspeed over the leg; a two-term power law with no battery-discharge nonlinearity, no climb/descent, no hover or turnaround energy; chosen, not measured, parameters. The claims are about the model class and do not predict any real aircraft.

## Next steps
Add crosswind and a wind-triangle solution; random wind per leg (combine with `uav-energy-twin`'s Jensen factor); turn-back policies that react to measured ground speed; a twin that estimates `w` from outbound ground speed and its uncertainty (how much does one leg tell about the return?); coupling with `drag-twin` when drag is not quadratic in airspeed.

## References
- Anderson, J. D. (2016). *Fundamentals of Aerodynamics*, 6th ed. McGraw-Hill.
- Tennekes, H. (2009). *The Simple Science of Flight*, revised ed. MIT Press.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
