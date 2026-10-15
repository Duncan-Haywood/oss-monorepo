# The twin whose gain is too small: errors-in-variables in system identification, and why more data makes it worse

*Stylised: a scalar static plant `y = a u + w` with Gaussian noise, `a=2, σu²=1, σw²=0.25`. Pure Python; every number is from `experiments/results.txt` (seeded, ~35 s). The "real" system is itself simulated; no lab or field data. Negative results are reported as such.*

## Question
A digital twin's gain is often fitted from logs in which the input was recorded by a noisy sensor (encoder, command echo, IMU) rather than the true actuated input. What does ordinary least squares recover, does the twin's own uncertainty report reveal the problem, what does it cost a controller built on the twin, and what do the standard repairs cost?

## Model
Real plant `y = a u + w`, `u~N(0,σu²)`, `w~N(0,σw²)`. Logged input `x = u + v`, `v~N(0,σv²)`. The twin fits `b̂ = cov(x,y)/var(x)`. With reliability ratio `λ = σu²/(σu²+σv²)`, `b̂ → aλ`. The residual `e=(a−b)u+w−bv` is uncorrelated with `x`, hence independent of it (jointly Gaussian), so `Var(b̂) ≈ Var(e)/(n(σu²+σv²))` with `Var(e)=(a−b)²σu²+σw²+b²σv²`. Repairs: (i) method of moments `cov(x,y)/(var(x)−σ̂v²)`; (ii) instrumental variable `cov(x₂,y)/cov(x₂,x)` with `x₂` a second measurement of `u` with independent noise. Misjudging the noise variance gives `plim = aσu²/(σu²+σv²−σ̂v²)`. These are textbook results (Fuller 1987; Carroll et al. 2006); the contribution is the twin-specific measurement of consequences.

## Results
1. **Attenuation law matches** (n=2·10⁵): simulated `b̂/a` = 0.999 / 0.900 / 0.802 / 0.501 / 0.200 against `λ` = 1.000 / 0.901 / 0.800 / 0.500 / 0.200 (σv² = 0 / 0.11 / 0.25 / 1 / 4). Fit R² is 0.941 / 0.847 / 0.755 / 0.469 / 0.188 against 0.941 for the true plant, and the residual–regressor correlation is ~1e-14 at every noise level: the diagnostics a builder would check cannot flag it.
2. **More data does not help; it makes the twin overconfident about the wrong number** (λ=0.8). Mean `b̂/a` is 0.803 / 0.799 / 0.801 / 0.800 / 0.800 at n = 20 / 50 / 200 / 1000 / 5000; RMSE/a is 0.226 / 0.211 / 0.202 / 0.200 / 0.200, flat at the bias `1−λ`. The exact standard deviation (`Var(e)/(n σx²)`) matches simulation (0.0648 vs 0.0664 at n=50, 0.0324 vs 0.0326 at n=200; 0.0145 vs 0.0137 at n=1000, about 5% apart with 2000 repeats; 0.103 vs 0.110 at n=20). The twin's own 95% interval covers the true gain 53.4% / 15.4% / 0% / 0% / 0% and covers the attenuated `aλ` 93.7% / 94.4% / 95.1% / 96.7% / 95.0%: its standard errors are right, centred on the wrong value.
3. **Consequence for a controller.** A feedforward gain `u=r/â` gives real output / target `a/â → 1/λ`: 1.050 / 1.250 / 2.000 at σv² = 0.05 / 0.25 / 1 (simulated at n=1000: 1.050 / 1.249 / 1.998). The twin predicts exactly the target.
4. **Repairs (λ=0.8, 4000 repeats).** At n=200, RMSE/a is 0.202 (OLS), 0.049 (moment correction, exact σv²), 0.045 (IV); at n=1000, 0.200 / 0.021 / 0.019. The moment correction is only as good as the noise variance: 20% too low or too high leaves a bias of −4.8% / +5.3% (population value; simulated −4.7% / +5.3% at n=1000), giving RMSE/a 0.051 / 0.059 at n=1000, where OLS is still 0.200. At n=20 the exact-noise correction has RMSE/a 0.213 against OLS 0.230 and a +20% misjudgement is worse than OLS (0.330); IV gets 0.172.
5. **Small samples reverse the ranking when the noise is heavy** (λ=0.5, σv²=1). RMSE/a at n=20: OLS 0.517, moment correction 13.68, IV 7.80 (the denominator can be near zero); at n=50: 0.507 / 1.92 / 0.307; at n=200: 0.501 / 0.140 / 0.111; at n=1000: 0.500 / 0.058 / 0.047. So the biased fit wins at n=20 and the IV wins from n=50; the moment correction needs n≈200 here.

## Limitations
Scalar static gain with Gaussian, independent, homoscedastic errors, where the attenuation and variance are exact; real logs have dynamics (attenuation then depends on the input spectrum and the noise colour), correlated sensor errors, heavy tails, and several regressors (attenuation spreads across coefficients and can flip signs). The IV result assumes a second measurement with independent noise and no shared error, which two sensors on one mount may not have. The noise variance is set by the experimenter here; estimating it (from repeated measurements or a stationary segment) adds variance not measured. Repair RMSEs at n=20 are dominated by rare near-zero denominators and are one seed's 4000 repeats. Not a claim about any specific robot.

## Next steps
Dynamic (ARX) plants where the bias depends on the input spectrum; multiple regressors and the sign-flip case; a diagnostic that does detect it (two-sensor disagreement, `var(x₂−x)` vs the claimed `σv²`); combining with `control-twin` to price the overshoot in closed loop; estimating `σv²` and propagating its uncertainty.

## References
- Fuller, W. A. (1987). *Measurement Error Models*. Wiley.
- Carroll, R. J., Ruppert, D., Stefanski, L. A. & Crainiceanu, C. M. (2006). *Measurement Error in Nonlinear Models*, 2nd ed. Chapman & Hall/CRC.
- Wooldridge, J. M. (2010). *Econometric Analysis of Cross Section and Panel Data*, 2nd ed. MIT Press (instrumental variables).
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
