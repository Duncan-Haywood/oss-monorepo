# Simulate the failure you cannot wait for: exact variance of mean-shift importance sampling in a twin, and how it fails when mis-tuned

*Stylised: a failure is the sum of `n=10` i.i.d. N(0,1) disturbances exceeding a threshold `b` (a gust, drift or contact-force accumulation). Pure Python; every number is from `experiments/results.txt` (seeded, seconds). The "real" system is itself simulated; no lab or field data. Negative results are reported as such.*

## Question
A safety twin must estimate a failure probability `p` of 1e-6 or smaller. Plain runs almost never see a failure. If the twin lets us inject disturbances from a shifted distribution and reweight (importance sampling, IS), how much does that save, how sensitive is it to the shift, and does the usual confidence interval remain trustworthy?

## Model
`S=ΣX_i`, `X_i~N(0,1)`, failure iff `S>b`, so `p=Q(b/√n)` exactly. Draw `X_i~N(θ,1)` and weight failures by `w=exp(−θS+nθ²/2)`; the estimate is unbiased for every `θ`. The one-run second moment is exact, `M₂(θ)=e^{nθ²}Q((b+nθ)/√n)`, so the squared relative error of `N` runs is `(M₂/p²−1)/N`; `θ=0` recovers the plain estimate `(1−p)/(Np)`. `θ*` minimises `M₂` (golden-section; `ln M₂` is convex). `S` is sufficient, so runs sample `S~N(nθ,n)` directly. Intervals are `mean ± 1.96·s/√N`.

## Results
1. **Formulas match simulation** (n=10, p=1e-4, 4·10⁵ runs): mean/p within 0.4% for every shift, relative variance 5.53 vs 5.51 (θ=1), 114.4 vs 113.7 (θ=2).
2. **Gain is enormous and grows as p shrinks.** With the optimal shift, one-run relative variance is only 3.4 / 5.4 / 6.8 / 8.1 at p=1e-3 / 1e-6 / 1e-9 / 1e-12 (naive: 10³…10¹²), so runs for 10% relative error are 343 / 535 / 684 / 809 versus 10⁵ / 10⁸ / 10¹¹ / 10¹⁴: speedups of 291× / 1.9·10⁵× / 1.5·10⁸× / 1.2·10¹¹×. `θ*` is slightly above `b/n` (1.537 vs 1.503 at p=1e-6).
3. **The shift is a narrow target with an asymmetric cliff** (p=1e-6). Half the optimal shift costs 23× the variance, 0.75× costs 2.3×, 1.5× costs 23×, 2× costs 1.7·10⁵× (as bad as no tilt), 3× costs 5·10²⁰×. Under-shooting degrades polynomially; over-shooting is catastrophic because `e^{nθ²}` grows in the tilt.
4. **A shift tuned for one design is fragile.** Tuned for p₀=1e-6 and used at other thresholds: 1.6–1.7× the re-tuned variance at b/b₀=0.8 or 1.2, 7.1× at 0.6 (the failure becomes common, weights waste), 17.6× at 1.5.
5. **The confidence interval misleads exactly when it matters** (p=1e-6, N=1000 runs, 2000 repeats). Plain runs see no failure in 99.9% of repeats and cover 0.1%. At `θ*`: coverage 94.9%, RMS relative error 0.072 (exact 0.073). At 0.5θ*: 91.7% coverage; at 0.75θ*: 96.0%; at 1.5θ*: 89.0% with median effective sample size 8.9 of 1000. At 2θ*: **2.8% coverage** and the sample RMS error of 32.7 hides an exact value of 30.3, and at 3θ* the exact relative error is 1.6·10⁹ while the samples show an RMS error of 1.0 and 0% coverage: the variance is carried by draws that never occur, so the sample standard deviation cannot warn you. Effective sample size (1.5 and 1.1 at 2θ*, 3θ*) does.

## Limitations
One-dimensional sufficient statistic with Gaussian disturbances, where the exact optimum and the exact variance are available; real twins have path-dependent failures (first passage, contact events), non-Gaussian and non-additive disturbances, and no closed-form `M₂`. Only constant mean-shift tilting, not cross-entropy adaptation, splitting or multilevel schemes. `θ*` is computed from the exact model, which is what a real user does not have; results 3–5 measure the cost of not having it. n=10, a single disturbance scale, one N for the coverage table, 2000 repeats (coverage standard error about 0.5 points). Not a claim about any specific robot.

## Next steps
Adapt `θ` online (cross-entropy) and measure the cost of learning it; first-passage failures with a Girsanov weight; defensive mixtures that cap the weight; twin-versus-real mismatch of the disturbance law, so the tilt tuned on the twin is applied to a real fault-injection rig; an ESS stopping rule (with `stop-twin`).

## References
- Bucklew, J. A. (2004). *Introduction to Rare Event Simulation*. Springer.
- Rubinstein, R. Y. & Kroese, D. P. (2017). *Simulation and the Monte Carlo Method*, 3rd ed. Wiley.
- Kong, A., Liu, J. S. & Wong, W. H. (1994). Sequential imputations and Bayesian missing data problems. *JASA* 89(425), 278–288 (effective sample size).
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
