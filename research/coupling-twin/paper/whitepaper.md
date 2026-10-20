# A per-axis twin certifies gains that axis coupling destabilises, and a fitted diagonal gain depends on how the logs were excited

*Stylised: two discrete-time integral loops with linear actuator cross-gain, pure Python, every number is from `experiments/results.txt` (deterministic, about a second). The "real" system is itself simulated; no lab or field data. Negative and out-of-model results are marked.*

## Question
Twins of multi-joint robots are often built and tuned one axis at a time. If the real actuators couple the axes (`G = [[1, c12], [c21, 1]]` instead of `G = I`), what does the per-axis twin get wrong about a loop `x⁺ = x − k G x`: the stable gain range, the decay rate of a twin-tuned gain, and, when the twin's diagonal gain is fitted from logs, what the answer depends on.

## Method
`I − kG` has eigenvalues `1 − k(1 ± r)` with `r = √(c12·c21)` when `p = c12·c21 ≥ 0`, and `1 − k(1 ± i√|p|)` when `p < 0`, with modulus `√((1−k)² + k²|p|)`. The twin (`G = I`) has modulus `|1−k|` and stability iff `0 < k < 2`. `model.py` implements the closed forms and an iteration that checks them; `run.py` tabulates them. Part 4 fits `y₁ = u₁ + c u₂ + noise` from logs with unit-variance inputs of correlation `ρ`, by ordinary least squares on `u₁` alone (the per-axis twin fit) and on `(u₁, u₂)` (full fit), 2000 seeded log sets of `n = 200`.

## Results
1. **The stable-gain limit shrinks to `2/(1+√p)` for `p ≥ 0` and to `2/(1+|p|)` for `p < 0`** (the twin says 2). Checked by the spectral radius just inside and outside the limit (0.9850 / 1.0150 at `c12 = c21 = 0.5`, limit 1.3333). Symmetric coupling of only 0.1 cuts the limit to 1.818; 0.9 gives 1.053.
2. **A twin-certified 10% gain margin fails at `c = 1/9`.** At `k = 1.8` the twin has radius 0.800 at every `c`; the real loop has 0.890 (`c = 0.05`), 0.998 (0.11, stable), 1.016 (0.12, unstable) and 1.160 (0.2).
3. **No scalar gain works if coupling dominates.** For `c12 = c21 = 1.2` the radius exceeds 1 at `k = 0.01`, 0.5 and 1 (1.002 at 0.01): the `1−r` mode has negative effective gain, so every `k > 0` amplifies it. Antisymmetric coupling is different: the limit `2/(1+|p|)` is 1.600 at `c = 0.5` (same as symmetric 0.25, because `|p|` enters linearly rather than as a root) but 0.400 at `c = 2`, where the symmetric case would have no stable gain at all.
4. **The twin's deadbeat gain `k = 1` has real rate exactly `√|p|`**, not 0. Steps to reach 1e-6 (twin: 1): 6, 16, 62, 270 for `c` = 0.1, 0.4, 0.8, 0.95, confirmed by simulation (|x| = 1.04e-6, 4.48e-7, 1.02e-6, 1.01e-6 at those steps). For `|c| > 1` (e.g. antisymmetric `c = 1.5`) the twin-deadbeat loop diverges at rate 1.5.
5. **A diagonal gain fitted from logs is `1 + cρ`, so the twin's "optimal" gain depends on the excitation, not only the plant.** The Monte Carlo mean matches to 4 digits for `ρ` = 0…0.99 (e.g. 1.1800 vs 1.1800 at `ρ = 0.6`). Designing deadbeat for the fitted gain (`k = 1/(1+cρ)`) gives real radius `c(1+ρ)/(1+cρ)` for `ρ ≥ 0`: 0.300 (`ρ = 0`), 0.407 (0.6), 0.455 (0.95), 0.4615 (1), and 0.585 at `ρ = −0.6`. Uncorrelated logs are best here; the penalty for correlated logs is 0.16 in radius at `c = 0.3`, mild but it never vanishes.
6. **Trade-off between the two fits (verified by Monte Carlo).** The full two-regressor fit is unbiased for `c` (0.3014…0.3096 over `ρ` 0…0.99) but its variance is `σ²/(n(1−ρ²))`: 1.25e-3 at `ρ = 0`, 6.3e-2 at 0.99 (Monte Carlo 1.21e-3 / 6.09e-2, within 5%). The per-axis fit is biased by `cρ` but its variance is `(σ² + c²(1−ρ²))/n`, nearly flat (1.7e-3 → 1.3e-3; Monte Carlo 1.36–1.79e-3, 5–8% above the plug-in formula, which ignores the random regressor variance). Near-collinear logs make coupling unidentifiable, and the per-axis fit hides that by returning a confident wrong gain.

## Limitations
Linear, noiseless-plant, two-axis, discrete-time, symmetric unit diagonal; no actuator dynamics, sampling delay (`latency-twin`) or saturation (`saturation-twin`); coupling is known exactly in parts 1–4. The noise model in part 5–6 is Gaussian with equal input variances. `G` is taken to be constant; state-dependent coupling (Coriolis, contact) is not tested. Not evidence about any particular robot. Nothing here uses or reproduces a specific paper by the labs named in the README.

## Next steps
Nonlinear (configuration-dependent) coupling with a gain-scheduled certificate; designing identification excitation that minimises the eventual real radius, not parameter variance; combining with the sensor-side twins (`fusion-twin`, `sync-twin`); continuous-time coupled plants with actuator lag.

## References
- Skogestad, S. & Postlethwaite, I. (2005). *Multivariable Feedback Control*, 2nd ed. Wiley.
- Ljung, L. (1999). *System Identification: Theory for the User*, 2nd ed. Prentice Hall.
- Åström, K. J. & Murray, R. M. (2008). *Feedback Systems*. Princeton University Press.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
