# A viscous twin never stops: Coulomb friction and the coast-down distance

*Stylised: a point mass with viscous plus Coulomb friction, closed forms plus a fine-step RK4 check; pure Python, every number is from `experiments/results.txt` (deterministic, under 1 s). The "real" system is itself simulated; no lab or field data, no noise. Negative and out-of-model results are marked.*

## Question
Sliding friction in joints, wheels and gearboxes has a dry (Coulomb) part that does not vanish at low speed. A twin that models friction as viscous only, `m v' = −k v`, with `k` fitted to logged decelerations, is the default in many simulators. How wrong is its stopping distance, where does the error change sign, and can any single viscous `k` be made safe over a wide speed range?

## Model
Real: `m v' = −b v − c` for `v > 0` (it stops at a finite time and stays). Integrating `dx = m v dv/(−(bv+c))` gives exactly `T(v0) = (m/b) ln(1 + b v0/c)` and `D(v0) = (m/b)[v0 − (c/b) ln(1 + b v0/c)]`, which tends to `m v0²/(2c)` at low speed and `m v0/b` at high speed. Twin: `D_tw = m v0/k`, it slows as `e^{−kt/m}` and never stops. Fit: least squares of deceleration on speed through the origin, `k = Σ a v/Σ v²`; for speeds uniform on `[v1, v2]`, `k = b + c·E[v]/E[v²]`, always above `b`. Affine regression on `(1, v)` recovers `(b, c)` and is the repair when the model class is allowed to change.

## Results (m = 1, b = 1, c = 0.5)
1. **Closed forms are exact.** Distance and time match RK4 (dt = 1e-4) to 9.4·10⁻⁹ relative error for `v0` from 0.1 to 100.
2. **The fitted gain depends on where the data were logged.** Closed form and a 2000-sample least squares agree to 6 digits: `k` = 1.2308 on `[1,3]`, 1.7258 on `[0.2,1]`, 1.0357 on `[5,20]`, 3.4419 on `[0.05,0.3]`. A twin identified at low speed is a much stiffer viscous damper. The affine fit returns (1.000000, 0.500000) in every range.
3. **Sign change of the stopping error.** The twin fitted on `[1,3]` (k = 1.2308) overestimates the distance by ×1.80 at `v0` = 1 and ×1.20 at 3, is correct at `v* = 7.34`, and underestimates above: ×0.958 at 10, ×0.835 at 100, tending to `b/k = 0.8125`. Below the fit range it is off by ×5.1 at 0.2 and ×17.3 at 0.05 (the twin distance is linear in `v0`, the real one quadratic). Conservative at low speed, optimistic (unsafe) at high speed, and the crossover sits outside the data.
4. **The twin never stops.** From `v0` = 3 the real mass stops at 1.946 s; the twin takes 6.51 s to fall to 10⁻³, 12.12 s to 10⁻⁶ and 17.73 s to 10⁻⁹ (growth as `ln(1/ε)`), so any "reached rest" logic or hold-position test built on the twin is time-dependent on a threshold that the real system does not have.
5. **No single viscous `k` covers a wide range (negative result).** Over `v0 ∈ [0.05, 3]` the least-squares twin overestimates the distance by up to ×17 (worst relative error 16.06) and the best possible minimax `k` (11.40) still has a worst relative error of 0.870; over `[0.2, 10]` the minimax figure is 0.684, over `[1, 3]` it is 0.200. Minimax is not free of risk: it underestimates the real distance by up to 0.405 (`[1,3]`), 5.80 (`[0.2,10]`) length units, whereas least squares never underestimates on these four ranges (margin 0) because it is conservative. Which is better depends on whether errors are costed symmetrically.
6. **Scale invariance.** Rescaling speeds and `c` by the same factor `s` = 1, 10, 100 leaves the twin/real distance ratio identical (1.35951290), so the error is governed by `c/(b v0)` alone.

## Limitations
One degree of freedom, symmetric friction, no stiction or Stribeck dip, no noise in the deceleration log, no load dynamics, sample speeds uniform; real logs have noisy accelerations (see `eiv-twin` for the attenuation this induces), and the fit here is noiseless so the `k` values are the population ones. A single parameter set (`c/b` = 0.5) is shown besides the scaling check. The "real" system is a model.

## Next steps
Stick-slip under a position loop with the same friction (joint with `deadband-twin`); noisy-log identification of `(b, c)` and its sample size; Stribeck curves; certifying a braking margin from the affine twin plus a confidence set (link to `twin-certification`).

## References
- Olsson, H., Åström, K. J., Canudas de Wit, C., Gäfvert, M. & Lischinsky, P. (1998). Friction models and friction compensation. *European Journal of Control* 4(3), 176–195.
- Armstrong-Hélouvry, B., Dupont, P. & Canudas de Wit, C. (1994). A survey of models, analysis tools and compensation methods for the control of machines with friction. *Automatica* 30(7), 1083–1138.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
