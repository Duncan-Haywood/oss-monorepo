# A constant-variance Gaussian camera twin gets the dark/bright threshold wrong, and a detector tuned in it pays for that

## Question
Camera simulators commonly add Gaussian noise of one fixed variance to rendered intensities. Real photon counting is Poisson, with variance equal to the mean. For a downstream detector trained or tuned in the twin, which decision rule does the twin teach, and what does it cost on the real sensor?

## Model
Real: `K ~ Poisson(λ)`. Hypotheses dark `λ0` and bright `λ1 > λ0`, equal priors, rule "bright iff `K ≥ m`", error `e(m) = ½[P(K0 ≥ m) + P(K1 < m)]` computed by exact Poisson summation. The likelihood ratio is `(λ1/λ0)^K e^{−(λ1−λ0)}`, so the Bayes rule is `K > L` with `L = (λ1−λ0)/ln(λ1/λ0)`, the logarithmic mean. Twin: `Normal(λ, s²)` with `s² = (λ0+λ1)/2`, whose optimal rule is `K > A = (λ0+λ1)/2`. A square-root twin (variance-stabilised, `√K` Gaussian with equal variance) gives `K > ((√λ0+√λ1)/2)² = (A+G)/2`, `G = √(λ0λ1)`. Since `G ≤ L ≤ (A+G)/2 ≤ A`, the twin's threshold is always too high for the real sensor.

## Results
(all numbers from `experiments/results.txt`)
1. Thresholds for 4 vs 12: 7.28 (exact), 7.46 (square-root twin), 8.00 (arithmetic twin); for 50 vs 100: 72.1, 72.9, 75.0.
2. A detector using the arithmetic rule has real error 0.0882 vs optimal 0.0703 at (4,12) (1.25×), 0.01844 vs 0.01006 at (10,30) (1.83×), 0.00292 vs 0.00168 at (50,100) (1.74×). Simulated error of the (4,12), (10,30), (10,20) arithmetic rules agrees with the exact value to within 0.0004 (200 000 draws per class).
3. With `λ1 = 2λ0`, the ratio of arithmetic-rule to optimal error is 1.00, 1.03, 1.00, 1.09, 1.13, 1.74, 3.98, 22.97 for `λ0` = 1, 2, 5, 10, 25, 50, 100, 200. The ratio is non-monotone at small counts because of integer thresholds.
4. The twin's own predicted error `Φ(−(λ1−λ0)/(2s))` is below the real error of its rule in all nine pairs of the main table (0.0512 vs 0.0673 at (2,10)), and 1.01–1.26× the real optimum, so error predictions from the twin look reasonable while the tuned rule is not.
5. The square-root threshold gives the optimal integer rule in 8 of 9 pairs and 1.02× the optimum at (2,10).

## Limitations
Simulated real sensor, no camera data. Ideal Poisson counts: read noise, dark current and gain variation would make the real sensor more Gaussian and shrink the gap. One pixel, two known intensities, equal priors. A twin that samples Poisson noise reproduces everything here by construction; the point is what a convenient Gaussian twin teaches. Differences at small counts are quantised by the integer threshold.

## Next steps
Unequal priors and many classes; a learned detector (e.g. logistic regression on `K`) trained in each twin; read-noise mixtures; spatial pooling over `n` pixels, where the sufficient statistic is the sum and the same log-mean threshold applies to `n·λ`.

## References
- Anscombe, F. J. (1948). The transformation of Poisson, binomial and negative-binomial data. *Biometrika* 35(3/4), 246–254.
- Cover, T. M. & Thomas, J. A. (2006). *Elements of Information Theory*, 2nd ed. Wiley.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
