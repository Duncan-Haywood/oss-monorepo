# A twin identified from closed-loop logs is blind to what the controller never varied: exact extrapolation variance, minimum-norm bias, and false stability certification

*Stylised: a scalar unstable plant identified by least squares from logs of a stabilising controller with dither. Pure Python; every number is from `experiments/results.txt` (seeded, ~1 min). No robot data. Negative results are reported as such.*

## Question
Twins are often fitted to logs of the controller that is already deployed, then used to test a different controller before it touches hardware. Held-out prediction on further logs is the natural validation. How much does that validation say about the new controller, and how much dither in the logs does it take?

## Model
Plant `x_{t+1} = a x_t + b u_t + w_t`, `w~N(0,σ²)`, `a=1.1, b=1, σ=1`. Logging controller `u_t = −k x_t + e_t`, `k=0.6`, `e~N(0,τ²)`, logged pole `ρ=a−bk=0.5`. The twin `(â,b̂)` is the least-squares fit of `x_{t+1}` on `(x_t,u_t)` from `n` transitions. Under a gain `k'` the twin predicts pole `â−b̂k'`, the plant has `a−bk'`. (i) Writing `z=(x,u)` with covariance `Σ=[[v,−kv],[−kv,k²v+τ²]]`, `v=(σ²+b²τ²)/(1−ρ²)`, `det Σ=vτ²`, the contrast `c=(1,−k')` gives `c'Σ⁻¹c=(k−k')²/τ²+1/v`, so `Var(â−b̂k') ≈ (σ²/n)[(k−k')²/τ²+1/v]`. At `k'=k` only `1/v` remains; away from it the variance is set by the dither. (ii) With `τ=0`, `u=−kx` is collinear with `x`: the data fix only `a−bk=ρ`, and the minimum-norm (ridge-limit) fit is `â=ρ/(1+k²)`, `b̂=−kρ/(1+k²)`. (iii) Rules for certifying a new gain stable: point (twin pole `<1`) and the standard OLS one-sided 95% upper bound on the contrast `â−b̂k'` (`s²c'(Z'Z)⁻¹c`, `z=1.645`).

## Results
1. **The variance formula holds** (n=500, 2000 fits; formula/simulated sd of the predicted pole): 0.0346/0.0344 (τ=0.5, k'=k=0.6), 0.0602/0.0616 (τ=0.5, k'=0.05), 0.1396/0.1420 (τ=0.1, k'=0.3), 0.2490/0.2552 (τ=0.1, k'=0.05). The mean is within 0.006 of the real pole in every row (largest: 1.0444 vs 1.05).
2. **Held-out validation is blind** (n=500, 300 fits, fresh logs of the same controller): one-step MSE/σ² is 1.0037 / 1.0027 / 1.0046 / 1.0035 / 1.0021 at τ = 1 / 0.3 / 0.1 / 0.03 / 0 (minimum norm), independent of τ. The sd of the predicted pole at `k'=0.05` over the same fits is 0.037 / 0.090 / 0.245 / 0.819 / 0.031.
3. **No dither gives a confident wrong twin.** At τ=0 the minimum-norm fit has mean `b̂=−0.219` (closed form −0.221; true +1) and predicts pole 0.377 at `k'=0.05` (closed form 0.379; real 1.05, unstable); the twin certifies the gain in 100% of fits, and its sd is tiny (0.031), so bootstrap-style spread would not warn either.
4. **False certification of the unstable gain `k'=0.05`** (1500 fits per cell, point rule / OLS bound; coverage of the bound in brackets): n=200: 0.199/0.006 (τ=1), 0.391/0.030, 0.440/0.040, 0.483/0.041 (τ=0.03) (0.942–0.957); n=1000: 0.029/0.001, 0.211/0.006, 0.389/0.019, 0.485/0.047 (0.946–0.965). The point rule tends to a coin flip as dither falls.
5. **Power cost of the bound** (truly stable `k'=0.2`, real pole 0.9): the bound certifies 0.601 / 0.257 / 0.093 / 0.055 (n=200, τ=1…0.03) and 0.997 / 0.637 / 0.185 / 0.085 (n=1000) of fits, the point rule 0.987–0.538 and 1.000–0.607. Low-dither logs cannot certify even a good controller, honestly.
6. **Dither budget** for a predicted-pole sd of 0.05 (exact solve; simulated sd 0.0490–0.0519 in every row): at `k'=0.05` (distance 0.55) τ = 1.23 / 0.40 / 0.16 at n = 200 / 1000 / 5000; at `k'=0.5` (distance 0.1) τ = 0.75 / 0.076 / 0.029. Extra logged `Var x` is ×2.51 / ×1.16 / ×1.03 for the far gain, ×1.56 / ×1.006 / ×1.001 for the near one. To first order `τ ≈ |k−k'|σ/(δ√n)`, so the dither needed scales with how far the test controller lies from the logged one.

## Limitations
One linear scalar plant with known structure, Gaussian noise, known logging gain and stationary start; ordinary least squares (no priors or physics constraints, which would change the τ=0 outcome). Stability is judged by the pole only. Dither is priced only as extra state variance, not as task cost or safety risk, and a real actuator would saturate it. Rates have standard errors of about 1 point. The OLS bound is standard; nothing here is a new estimator, and the contribution is the exact form of the extrapolation variance and its consequences for twin validation. Real data and multivariable plants (where directions, not one scalar, go unexcited) are not tested.

## Next steps
Multivariable plants and the directional version of the variance (`c'Σ⁻¹c` along the test controller's unexcited directions); informative-experiment design that spends a fixed dither budget on the test controller's contrast; nonlinear and misspecified twins; physics priors versus dither; propagate to the field-robot and manipulation twins in this repository.

## References
- Ljung, L. (1999). *System Identification: Theory for the User*, 2nd ed. Prentice Hall.
- Forssell, U. & Ljung, L. (1999). Closed-loop identification revisited. *Automatica* 35(7), 1215–1241.
- Gevers, M. & Ljung, L. (1986). Optimal experiment designs with respect to the intended model application. *Automatica* 22(5), 543–554.
- Hjalmarsson, H. (2005). From experiment design to closed-loop control. *Automatica* 41(3), 393–438.
