# A state estimator tuned in a wrong-noise twin: exact real cost, asymmetry, and innovation retuning

*Stylised: scalar linear-Gaussian plant, stationary regime. Pure Python; every number is from `experiments/results.txt` (seeded, ~11 s). Simulation rows (E6, E7) carry sampling error; E1–E5 are exact formulas.*

## Question
An estimator is tuned in a twin whose noise levels `(Q_t, R_t)` are guesses. What does the real system pay, does the twin's own error report warn about it, does the direction of the mistake matter, and can real data repair it cheaply?

## Method
Real plant `x' = a x + w`, `w~N(0,Q)`; sensor `y = x + v`, `v~N(0,R)`. Filter: `x̂ = a x̂_prev + K ν`, innovation `ν = y − a x̂_prev`. Posterior error obeys `e' = (1−K)(a e + w) − K v`, so under any fixed `K` its stationary variance is `P(K) = ((1−K)²Q + K²R)/(1 − (1−K)²a²)`. The twin's gain is the Riccati-optimal gain for `(Q_t,R_t)`, which depends only on `ρ_t = Q_t/R_t`; regret is `P(K_t)/P* − 1` and `m = ρ_t/ρ`. The prior error under gain `K` is `Π = (Q + a²K²R)/(1 − a²(1−K)²)`, giving `c0 = Var ν = Π + R` and `c1 = Cov(ν_k,ν_{k+1}) = a[(1−K)Π − KR]`, which vanishes iff `K = Π/(Π+R)`, the optimal gain (Mehra 1970). Retuning: from sample `c0, c1` of the innovations of a filter running at gain `K`, `Π = c1/a + K c0`, `R̂ = c0 − Π`, `Q̂ = Π(1−a²(1−K)²) − a²K²R̂` (clipped at ≥1e-6·c0), then the Riccati gain for `(Q̂,R̂)`.

## Results
1. **Wrong-Q twin** (`a`=0.9, `Q`=`R`=1, twin `R_t`=1): `m`=0.001/0.01/0.1/0.25/0.5: real MSE 4.99/3.57/1.32/0.836/0.652 against the optimum 0.597 (regret 7.4/5.0/1.21/0.40/0.09); the twin's own claim is 0.005/0.043/0.215/0.347/0.468 (claim/real 0.001/0.012/0.16/0.42/0.72). A too-quiet twin is optimistic exactly where it is most wrong. Too-noisy: `m`=2/4/10/100/1000 regret 0.068/0.22/0.42/0.64/0.67 and the claim is slightly *pessimistic* (claim/real 1.13/1.13/1.08/1.01/1.00).
2. **Asymmetry.** Regret for a factor-`f` quiet vs noisy error: `a`=0.9, `f`=10: 1.21 vs 0.42; `f`=100: 4.97 vs 0.64 (noisy/quiet 0.13). For `a`=1: 6.39 vs 0.59 at `f`=100. The noisy side saturates (`K→1` gives MSE `R` = 1, +67% at `a`=0.9); the quiet side does not (`K→0` gives open-loop MSE `Q/(1−a²)`, +781% at `a`=0.9, unbounded at `a`=1).
3. **Local law.** `regret ≈ c (ln m)²` with `c` = 0.230/0.167/0.147/0.145/0.122 at `a`=0.5/0.9/0.99/1.0/1.1 (from `m = e^{±0.1}`).
4. **Random walk.** For `a`=1 and a quiet twin, real MSE ≈ 1/(2√m) (`m`=1e-4: 49.5, 1e-6: 499.5) while the twin claims ≈ √m (0.010 at 1e-4): regret 79 and 807. Regret grows as `m^{−1/2}`.
5. **No instability cliff (negative result).** For `a`>1 the Riccati gain is always above the stability limit `1−1/a` (its `ρ→0` limit is `1−1/a²`), so a twin with wrong noise never makes a scalar filter diverge; regret stays finite (tested `a`=1.3, `ρ_t` from 1e-12 to 1e6).
6. **Whiteness diagnostic.** At `a`=0.9, `Q`=`R`=1: lag-1 covariance is +1.36/+0.50/0/−0.22/−0.66 at `K`=0.2/0.4/0.597/0.7/0.9; innovation variance alone (3.14/2.59/2.48/2.51/2.67) is nearly flat near the optimum and is a poor tuning signal.
7. **Simulation check** (400,000 steps, `m`=0.05, `K`=0.141): MSE 1.885 vs exact 1.882; `c0` 3.533 vs 3.525; `c1` +1.833 vs +1.825.
8. **Retune** (200 repetitions): from `m`=0.05 (regret 2.15), mean regret 0.0262/0.00582/0.00127/0.00022 at `n`=200/1,000/5,000/25,000 (median 0.0134/0.0023/0.00075/0.00011); from `m`=20 (regret 0.53) 0.0574/0.0080/0.0020/0.00033. Regret·`n` is 5.2–6.4 (`m`=0.05) and 8.0–11.5 (`m`=20): consistent with `1/n`; no clipping occurred at these `n`.

## Limitations
Scalar linear-Gaussian system with known `a`; a real estimator has many states and unknown structure, where the Mehra retune is ill-conditioned and needs many more samples (not tested). The twin is wrong only in noise levels; model and dynamics errors (see `timestep-twin`, `safety-twin`) are separate. Only stationary error is analysed (no transient), fixed gains only, and the `1/n` scaling of the retune is a simulation observation, not derived. The retune uses innovations from the real system, which a twin-only workflow does not have. No sensor or robot data. Preliminary.

## Next steps
Derive the retune's asymptotic regret; multivariate filters with the Mehra/autocovariance least-squares method; a twin with wrong `a` as well; using the twin's innovation whiteness as an online fidelity monitor, and pricing that check with the proper-scoring tools of `twin-elicitation`.

## References
- Kalman, R. E. (1960). A new approach to linear filtering and prediction problems. *J. Basic Engineering*.
- Mehra, R. K. (1970). On the identification of variances and adaptive Kalman filtering. *IEEE Trans. Automatic Control*.
- Anderson, B. D. O., Moore, J. B. (1979). *Optimal Filtering*. Prentice-Hall.
