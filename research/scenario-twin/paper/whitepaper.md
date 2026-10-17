# Rare failures from a digital twin: a scenario generator narrower than the world makes the estimate silent, not just biased

*Stylised: real scenario latent `x ~ N(0,1)`, failure iff `x > a`, twin generator `N(0,s²)`. Pure Python; every number is from `experiments/results.txt` (seeded, ~40 s; 2,000–4,000 repetitions, coverages carry ≈0.01 sampling error). The twin's failure indicator is assumed correct: this isolates the scenario distribution.*

## Question
A twin is used to estimate a real failure probability `P` by sampling scenarios from its own generator (domain randomisation range, weather model). What does a generator that is narrower or wider than the real scenario distribution do to the estimate, and what repairs it?

## Method
`p = N(0,1)` is the real scenario density, `q = N(0,s²)` the twin's, failure iff `x > a`, `P = Q(a)`. The raw twin rate is `Q(a/s)`. The weighted estimator averages `w·1{x>a}` with `w = p/q = s·exp(−x²(1−1/s²)/2)`, unbiased for `P`. Its second moment is `∫_a^∞ p²/q = s·τ·Q(a/τ)` with `τ² = s²/(2s²−1)` for `s² > 1/2` and infinite otherwise; per-sample relative variance is that over `P²` minus 1 (`(1−P)/P` at `s=1`). The best width is found by golden-section search. A defensive mixture `q = (1−λ)N(0,s²) + λN(0,1)` bounds `w ≤ 1/λ`; its second moment is integrated numerically (Simpson, 40,000 points). Worked scenario: braking from 15 m/s with an obstacle at 35 m and friction `0.7·exp(−0.25x)` gives `a = 3.0365`, `P = 1.197e-3`; a 1 ms explicit-Euler twin stopping at the critical friction travels 35.008 m (within `v·dt/2`), so the threshold is consistent with a stepped simulator.

## Results
1. **Raw twin claim.** `s`=0.5/0.6/0.7/1.25/2/3: claims 6.3e-10/2.1e-7/7.2e-6/7.6e-3/6.4e-2/0.156 against `P`=1.2e-3: a narrow twin under-claims by 166–1.9e6×, a wide one over-claims 6–130×; only `s=1` is right.
2. **Finiteness cliff.** Reweighted relative variance per sample: infinite for `s ≤ 0.707`, 84,597 at 0.75, 18,829 at 0.8, 835 at 1.0 (plain Monte Carlo, 83,459 runs for 10% standard error), 148/63/30 at 1.25/1.5/2, minimum 21.8 at 3.25. Simulation (n=2000, 4,000 reps) matches the law: sd/P 0.641 vs 0.646 (`s`=1), 0.178 vs 0.177 (1.5), 0.122 vs 0.123 (2), 0.102 vs 0.104 (3.25); mean/P 0.989–1.002.
3. **Silent failure below the cliff.** At `s`=0.6 all 4,000 runs of 2,000 scenarios found no failure (estimate 0, coverage 0.000, no standard error to warn). At `s`=0.8, finite variance but 86.5% of runs report zero and Wald coverage is 0.135 (mean/P 1.031, sd/P 3.4 vs law 3.07: the heavy tail is undersampled). Median effective sample size of the failure weights (`(Σw)²/Σw²`) is 0.0 at `s`=0.6 and 0.8, 2.0 at `s`=1, 31 at 1.5, 64.5 at 2.0, 88 at 3.25; Wald coverage 0.905/0.940/0.942/0.951 for `s`=1/1.5/2/3.25. At `s`=1 with 2.4 expected failures the interval undercovers (0.905) even though the estimator is exactly unbiased.
4. **Optimal width.** `s*` ≈ 1.05·`a` (2.24, 3.25, 4.12, 5.10, 6.08 at `a`=2, 3.09, 4, 5, 6), relative variance 10.7, 22.5, 35.9, 54.6, 77.4, i.e. 4×, 44×, 879×, 6.4e4×, 1.3e7× cheaper than plain Monte Carlo at `P`=2.3e-2…1e-9. Twin runs for 10% error on the braking case: 2,179 vs 83,459.
5. **Defensive mixture is not a rescue.** With `s`=0.6: exact relative variance 16,656 / 8,342 / 4,174 / 1,670 at `λ`=0.05/0.1/0.2/0.5 (bound `1/(λP)−1`: 16,711…1,670), i.e. finite but 2–20× *worse* than plain Monte Carlo (835), since the narrow component adds nothing; simulated coverage at n=2000 is 0.12/0.22/0.39/0.71 (zero-failure runs 0.879/0.777/0.612/0.290). Mixing 20% real prior into a wide twin (`s`=3.25) costs 27.2 vs 21.8.

## Limitations
One-dimensional Gaussian scenarios with a known threshold; real robot scenarios are high-dimensional, where weight degeneracy is far worse and `s*≈1.05a` does not transfer. It assumes the real scenario density is known and that the twin's failure indicator is right; in practice both are estimated, and the twin's own dynamics bias (see `safety-twin`, `timestep-twin`) adds to, not replaces, this error. The infinite-variance condition depends on tail shapes (a lighter-tailed real distribution than the twin's would have finite variance for every `s`). Nothing uses simulator or robot data. Preliminary.

## Next steps
Multivariate scenarios with cross-entropy adaptation of the twin's generator; failure regions found by a pilot rather than known; monitoring effective sample size online as a stopping rule; combining reweighting with the control-variate estimator of `twin-evaluation`; heavy-tailed real scenarios.

## References
- Owen, A. B. (2013). *Monte Carlo theory, methods and examples*, ch. 9 (importance sampling).
- Bucklew, J. A. (2004). *Introduction to Rare Event Simulation*. Springer.
- Tobin, J. et al. (2017). Domain randomization for transferring deep neural networks from simulation to the real world. *IROS*.
