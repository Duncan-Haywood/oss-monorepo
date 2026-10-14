# A Gaussian sensor twin and the innovation gate it mis-prices

## Question
A state estimator skips a measurement when its innovation is implausible under the model (a chi-square gate). In a digital twin whose sensor is the datasheet Gaussian, every gated measurement is good data thrown away. How wrong is the twin's verdict on the gate when the real sensor has outliers, and what does the gate do when the state itself jumps?

## Model
Prior error `e ~ N(0, P)`; measurement noise `v` is a scale mixture: component `c` has weight `w_c` and variance `R_c` (inlier `R`, outlier `κ²R` w.p. `ε`); innovation `ν = e + v`. Gain `K = P/(P+R)` from the twin's `R`. The filter sets `x̂ += Kν` if `|ν| ≤ c = z√(P+R)`, `z = Φ⁻¹(1−α/2)`, otherwise leaves `x̂`. Given component `c`, `ν ~ N(0, S_c)`, `S_c = P+R_c`, and `e | ν ~ N(βν, PR_c/S_c)`, `β = P/S_c`. With `q_c = 2Φ(z_c)−1`, `z_c = c/√S_c`, and `m_c = S_c(q_c − 2z_cφ(z_c)) = E[ν²; |ν|≤c]`, the exact MSE is `Σ_c w_c [ P + ((β−K)² − β²) m_c ]` (accepted: `(β−K)² m_c + (PR_c/S_c) q_c`; rejected: the prior's `P` minus its accepted share `β² m_c + (PR_c/S_c) q_c`, with `β = β_c = P/S_c`). The twin is `ε = 0`. Jump experiment: scalar random walk `x' = x + w`, `y = x + v`, `Q = 0.01`, `R = 1`, steady-state gain, gate `z = 2.576`; on a rejection the prior variance grows by `Q`, on acceptance it resets to its steady value.

## Results
(all from `experiments/results.txt`; `P = R = 1`, `K = 0.5`, `ε = 0.05`, `κ = 10` unless stated)
1. **The twin mis-signs the gate.** Twin MSE ungated 0.5000; gated 0.6396, 0.5422, 0.5063 for `α = 0.05, 0.01, 0.001` (+27.9%, +8.5%, +1.3%). Real MSE ungated 1.7375; gated 0.6642, 0.5799, 0.5611 (reduction 2.6×, 3.0×, 3.1×). Real inlier rejection equals `α`; outlier acceptance is 21.7%, 28.3%, 35.7% (more at wider gates).
2. **Worst outlier scale.** At `α = 0.01` the ungated MSE is 0.50, 0.80, 1.74, 11.7, 125, 1.25e4, 1.25e6 for `κ = 1, 5, 10, 30, 100, 1000, 10⁴` (`≈ 0.0125κ²`); the gated MSE is 0.542, 0.588, 0.580, 0.570, 0.567, 0.565, 0.565. The gated maximum is at `κ* = 3.79, 4.12, 4.60` for `α = 0.05, 0.01, 0.001` (0.669, 0.589, 0.575): outliers just beyond the nominal scale pass the gate and are never down-weighted, wild ones are rejected.
3. **Gate width.** The grid-optimal `z` for the real sensor is 3.67, 3.17, 2.63, 3.26, 3.80 for `(ε, κ) = (0.01, 10), (0.05, 10), (0.2, 10), (0.05, 3), (0.05, 100)`; its MSE gain over the twin's `z = 2.576` is 6.3%, 3.3%, 0.04%, 3.5%, 6.3%, against reductions of 26%, 67%, 87%, 2.3%, 99.5% from having the gate at all at `z = 2.576` in the same five rows (ungated 0.748, 1.738, 5.45, 0.600, 125.5).
4. **Monte Carlo (1e6 draws, seed 11).** Exact versus MC: 0.5799/0.5788 (real, `α = 0.01`), 0.6642/0.6651 (real, 0.05), 0.5422/0.5432 (twin, 0.01); ratios 0.998–1.002. The tests also check the closed form against numerical integration (agreement to 5 places) and the limits `c = ∞`, `c = 0`, `K = 0`.
5. **Lockout after a jump.** Mean steps until `|error| ≤ 1` (400 runs per row): gated 21.2, 546, 4009, 10918, 30512 for `D = 3, 5, 8, 12, 20`; ungated 11.8, 16.6, 21.4, 25.4, 30.4. Gated time over `D²` is 2.4, 21.9, 62.6, 75.8, 76.3, so it is quadratic in `D` for large jumps while the ungated filter's is logarithmic. A noise-free count of rejections until the gate first admits the jump, `⌈(D²/z² − R − P_ss)/Q⌉` (26, 267, 855, 2060, 5919), has the same scaling but is 1.6–5× below the simulation at large `D`: it ignores that a single acceptance applies only a gain-sized correction and then resets the gate.

## Limitations
Stylised, no sensor logs. One scalar update with a correct prior variance, a fixed gain, and a symmetric outlier component; one operating point; Item 5 uses a simplified covariance rule, a scalar plant and a plain random-walk drift, with a gate that never adapts (adaptive or windowed gates, or inflating `R` instead of rejecting, would change it). The twin is a naive baseline and an outlier-aware twin would reproduce the real numbers by construction; the contribution is the size of the error from the omission and the exact form of the gated MSE, not a new estimator.

## Next steps
Fit `(ε, κ)` from real innovation logs and bootstrap the gate; gate-plus-inflation (Huber-type) updates; a multi-step filter with the gate in the loop and a proper covariance recursion for the lockout time; connect to `filter-twin` (mis-tuned noise levels) and `loop-closure-twin` (gating in data association).

## References
- Bar-Shalom, Y., Li, X. R., Kirubarajan, T. (2001). *Estimation with Applications to Tracking and Navigation*. Wiley.
- Huber, P. J. (1964). Robust estimation of a location parameter. *Annals of Mathematical Statistics* 35(1), 73–101.
- Andrews, D. F., Mallows, C. L. (1974). Scale mixtures of normal distributions. *Journal of the Royal Statistical Society B* 36(1), 99–102.
- Kalman, R. E. (1960). A new approach to linear filtering and prediction problems. *Journal of Basic Engineering* 82(1), 35–45.
