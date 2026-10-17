# A test run sized in a twin with the wrong plant pole can be too short by 4× or too long by 2×

*Stylised: scalar linear-Gaussian plant, stationary regime. Pure Python; every number is from `experiments/results.txt` (~15 s). E1–E4 are exact formulas; E5–E6 are simulation.*

## Question
A team validates a controller with a real test run whose length was chosen in the digital twin ("the twin says a 3,000-step run pins the mean cost to ±5%"). If the twin's dynamics are wrong, is that run long enough?

## Method
Real plant `x' = a x + b u + w`, `w~N(0,W)`, cost `(q + rK²) x²` per step for a fixed gain `K`. The gain is the twin's LQR gain for pole `a_t = m·a` (`b` known). The real closed-loop pole is `a_c = a − bK`; the twin believes `a_c,t = a_t − bK`. For a stationary Gaussian AR(1), `cov(x_t², x_{t+k}²) = 2σ⁴ a_c^{2k}`, so with `ρ = a_c²` the run mean of `x²` over `n` steps has exact relative variance `(2/n)[(1+ρ)/(1−ρ) − 2ρ(1−ρ^n)/(n(1−ρ)²)]` (tests compare this to the double sum and to simulation). The run length for relative half-width `ε` at 95% is the smallest `n` with `1.96·sd ≤ ε` (asymptotically `n ≈ 2z²(1+ρ)/((1−ρ)ε²)`). The ratio real/twin is therefore `(1+ρ_r)(1−ρ_t)/((1−ρ_r)(1+ρ_t))`, independent of `ε`, `q`, `W` and of the cost weights.

## Results
(`a`=0.9, `b`=1, `q`=1, `ε`=5%.)
1. **Exact law.** Exact vs simulated relative variance at `a_c`=0.7: 0.509/0.499 (`n`=10), 0.114/0.113 (`n`=50), 0.0290/0.0291 (`n`=200).
2. **Sizing error in both directions.** Twin-sized vs real-needed run length: `m`=2, `r`=0.1: 3,177 vs 12,110 (3.8× too short; real pole −0.77 against the twin's 0.13); `m`=0.5, `r`=5: 4,007 vs 15,069 (3.8×); `m`=1.5, `r`=5: 6,837 vs 3,248 (2.1× too long); matched twin (`m`=1) gives ratio 1 by construction. The closed-loop pole, not the gain, sets it; note a negative real pole (an over-aggressive, oscillating loop) is as slow to average as a positive one of equal modulus.
3. **Coverage.** A run of the twin-sized length gives half-width 0.098 instead of 0.05 in the two 3.8× cells, i.e. real coverage of the ±5% claim 0.685 and 0.688 (nominal 0.95); simulation (2,000 runs) gives 0.678 and 0.673. The over-long cell gives 0.996 (simulated 0.997).
4. **Unstable cells.** For `m`=3 the gain destabilises the real loop for every `r` tried (0.1, 1, 5), so no run length exists; the sizing question presupposes stability, which is `control-twin`'s subject.
5. **Repair from a real pilot.** Plugging `ρ̂ = φ̂²` (lag-one autocorrelation of `x` on the real pilot) into the exact size gives median 5,142/5,121/5,123 for pilots of 100/400/1,600 steps against the true 5,145 (`m`=2, `r`=1; the twin-sized run is 4,229). The estimate is close to median-unbiased but it under-sizes about half the time (P(`n̂` < `n_real`) = 0.50/0.51/0.53), and by more than 20% in 11%/1%/0% of pilots; a safety factor or an upper confidence bound on `ρ` is needed for a guarantee, which is not derived here.

## Limitations
Scalar plant, `x`-observed, fixed known gain; the cost is a fixed multiple of `x²`. Normal approximation for the interval (E5 shows it adequate at these `n`, but heavy correlation with small `n` will be worse). Non-Gaussian noise (fourth-moment terms), multivariable plants with several slow modes, and non-stationary starts are not covered. The pilot repair is not a valid confidence procedure. No robot data. Preliminary.

## Next steps
An upper-confidence sizing rule for `ρ`; multivariable case where the slowest mode dominates; sequential stopping with an anytime-valid interval (cf. `twin-audit`); the same question for success-rate rather than mean-cost claims.

## References
- Anderson, T. W. (1971). *The Statistical Analysis of Time Series*. Wiley.
- Geyer, C. J. (1992). Practical Markov chain Monte Carlo. *Statistical Science* 7(4).
- Glynn, P. W., Whitt, W. (1992). The asymptotic efficiency of simulation estimators. *Operations Research* 40(3).
- Anderson, B. D. O., Moore, J. B. (1971). *Linear Optimal Control*. Prentice-Hall.
