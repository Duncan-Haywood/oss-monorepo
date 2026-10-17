# A kinematic-bicycle twin of a car ignores tyre slip: steady-turn radius is off by 1 + K v²/L, and calibrating that does not reveal the closed-loop stability limit

## Question
Lightweight vehicle twins for path tracking often use the kinematic bicycle (`ψ' = v δ / L`, no tyre slip). What does such a twin get wrong about a real car with tyre slip, how does the error scale with speed, and if the twin is calibrated on the steady-turn data it gets wrong (the understeer gradient), does it then predict which steering-feedback gains are safe at speed?

## Model
Real system: linear single-track car at constant forward speed `v`, states (lateral offset `y`, heading error `ψ`, body lateral speed `v_y`, yaw rate `r`), axle forces `F_yf = C_f(δ − (v_y + a r)/v)`, `F_yr = −C_r(v_y − b r)/v`; `m = 1500 kg`, `I_z = 2500 kg m²`, `a = 1.2`, `b = 1.4` (`L = 2.6 m`). Understeer car `C_f = 60 kN/rad`, `C_r = 80 kN/rad`; oversteer car `C_f = 80 kN/rad`, `C_r = 50 kN/rad`. Understeer gradient `K = (m/L)(b/C_f − a/C_r)` (Rajamani 2012; Gillespie 1992). Twin: `y' = vψ`, `ψ' = vδ/L`. Calibrated twin: `ψ' = vδ/(L + K v²)`. Controller: `δ = −k_p y − k_d ψ`. Stability of the real 4-state loop is decided exactly by a Routh test on the characteristic polynomial (Faddeev–LeVerrier), cross-checked by RK4 simulation. Pure Python, no dependencies.

## Results
(all numbers from `experiments/results.txt`)
1. **Steady-turn law.** Steering the real car with the twin's angle `δ = L/R` gives radius `R(1 + K v²/L)`, matched by simulation to 6 digits. Understeer car (`K = 4.81·10⁻³ s²/m`, characteristic speed `√(L/K) = 23.26 m/s`), `R = 100 m`: real radius 104.6, 118.5, 141.6, 174.0, 266.4 m at 5, 10, 15, 20, 30 m/s; the twin's radius is 4.4%, 15.6%, 29.4%, 42.5%, 62.5% too small, and exactly half at the characteristic speed. Oversteer car (`K = −3.75·10⁻³`): real radius 96.4, 85.6, 67.5, 42.3 m at 5, 10, 15, 20 m/s (critical speed 26.33 m/s), i.e. the twin's radius is too large by 3.7%, 16.9%, 48.0%, 136.4%.
2. **A steady-state calibration fixes exactly what it is fitted to.** With `K` in the twin the radius error is 0 (to numerical precision) at every speed tested, both cars.
3. **Neither twin certifies anything about closed-loop speed limits.** Under `δ = −k_p y − k_d ψ` the kinematic twin's closed loop is `s² + (v k_d/L)s + v² k_p/L`, Hurwitz for every `v, k_p, k_d > 0`; the calibrated twin has the same form with `L + K v²` and is also stable everywhere. On the real understeer car, 11 of a 30-point gain grid (`k_p` 0.02–0.8, `k_d` 0.2–4) that both twins call stable at every speed 1–60 m/s lose stability below 60 m/s. Examples (max stable speed, m/s): (0.05, 0.2) 23.1; (0.1, 0.5) 36.3; (0.2, 0.5) 19.0; (0.4, 0.5) 14.0; (0.4, 1.0) 23.8; (0.8, 0.2) 10.1. Higher `k_d` at a given `k_p` removes the limit on this grid.
4. **Time-domain confirmation.** `k_p = 0.4, k_d = 0.5`, 1 m initial offset: at 8 m/s the real offset is 1.1·10⁻⁹ m after 25–30 s; at 20 m/s it is 4.6·10⁷ m (diverged).
5. **Oversteer.** The open-loop lateral block is stable at 10 and 20 m/s and unstable at 30 m/s (critical speed 26.33 m/s). Feedback `(0.05, 0.5)` loses stability at 23.7 m/s, below the critical speed, while the twin is stable at all speeds.

## Limitations
Linear tyres with constant cornering stiffness, constant forward speed, small angles, no actuator lag or steering dynamics, no sensor delay, no load transfer, one vehicle parameter set per sign of `K`; the "real" car is a model, not a measured vehicle. Tyre saturation would make `K` depend on lateral acceleration, so a calibration on low-acceleration data would extrapolate worse than here; this is not tested. The stability limit is found by scanning speed from 1 m/s in 0.5 m/s steps and bisecting the first loss of stability, so a stable window beyond the first loss would be missed. I did not derive the stability limit in closed form; the twin misses it because the real steering-to-offset path is fourth order (sideslip and yaw dynamics), which the first-order twin cannot represent, but I did not isolate which pole pair crosses.

## Next steps
Nonlinear (Pacejka-style) tyres and the extrapolation of a low-acceleration calibration of `K`; identifying the yaw-response time constant from data rather than steady turns and checking whether a two-parameter twin predicts the limit; actuator and sensor delay (`latency-twin`, `sample-twin`); speed-scheduled gains certified on the real model; coupling with `terrain-twin` for off-road slip.

## References
- Rajamani, R. (2012). *Vehicle Dynamics and Control*, 2nd ed. Springer.
- Gillespie, T. D. (1992). *Fundamentals of Vehicle Dynamics*. SAE International.
- Polack, P., Altché, F., d'Andréa-Novel, B. & de La Fortelle, A. (2017). The kinematic bicycle model: a consistent model for planning feasible trajectories for autonomous vehicles? *IEEE Intelligent Vehicles Symposium*.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
