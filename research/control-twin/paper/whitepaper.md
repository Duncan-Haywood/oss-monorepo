# A controller designed in a wrong-actuator twin: exact real cost, an instability band, and dithered retuning

*Stylised: scalar linear-Gaussian plant, stationary regime. Pure Python; every number is from `experiments/results.txt` (seeded, ~12 s). E1–E3, E5, E7, E8's dither cost and the delta-method column are exact formulas; E4 and E6 are simulation.*

## Question
A controller is designed in a twin whose actuator gain `b_t` is a guess. What does the real system pay, does the twin's own cost report warn of it, does the direction of the error matter, and can real data repair it?

## Method
Real plant `x' = a x + b u + w`, `w~N(0,W)`, cost per step `q x² + r u²`. The twin has `(a, b_t)` (dynamics `a` known) and designs the Riccati gain `K_t = abP/(r+b²P)` with `b_t²P² + (r(1−a²) − q b_t²)P − qr = 0`; its own claimed cost is `P W`. Under any fixed gain the real loop is `x' = (a−bK)x + w`, so the real cost is `J(K) = (q+rK²)W/(1−(a−bK)²)` when `|a−bK|<1` and infinite otherwise. Regret is `J(K_t)/J* − 1` and `m = b_t/b`. Retuning: run `u = −K x + d·ε` (`ε~N(0,1)`) on the real plant, regress `x'` on `(x,u)`. Per-step information is `[[V, −KV],[−KV, K²V+d²]]/W` with `V = (W+b²d²)/(1−(a−bK)²)`, whose determinant `Vd²/W²` vanishes iff `d=0`; the asymptotic covariance of `(â,b̂)` is then `Var b̂ = W/(nd²)`, `Var â = W(K²V+d²)/(nVd²)`, `Cov = WK/(nd²)`. Regret of the certainty-equivalent redesign is approximated by `½ tr(HΣ)` with `H` the numerical Hessian of regret at the truth (its gradient is zero).

## Results
1. **Wrong actuator** (`a`=0.9, `b`=1, `q`=1, `r`=0.1, `W`=1, optimum 1.074): `m`=0.7/0.5/0.4/0.3: real cost 1.161/1.508/2.078/4.250 (regret 0.08/0.40/0.93/2.96) against claims 1.140/1.245/1.346/1.520; `m`=0.2: unstable (pole −1.023), claim 1.865. Too strong: `m`=1.5/2/4/10/100: regret 0.075/0.20/0.72/1.71/3.52, claim always ≈1.0.
2. **Instability band.** As `r→0` the loop diverges iff `m < a/(a+1)` (0.3333/0.4737/0.5 for `a`=0.5/0.9/1, found by bisection to 4 digits). For `a`>1 a too-strong twin also diverges (`m` > 6.0 at `a`=1.2, > 3.0 at `a`=1.5, `r`→0). With `r`=0.1 and `a`=0.9 the unstable set is the band `m` ∈ (0.089, 0.214), stable again below it; for `a`=0.5 or `r`=1 at `a`≤1 it is empty on the scanned range (1e-6…1e6).
3. **Asymmetry** (`a`=0.9, `r`=0.1): factor 1.5/2/3 too weak: regret 0.108/0.404/1.88; too strong: 0.075/0.205/0.477. Factor 10 too weak is unstable; factor 100 too weak gives 0.178 (inside the stable region beyond the band).
4. **Simulation check** (400,000 steps): `m`=0.7 exact 1.1611 vs simulated 1.1627; `m`=2 1.2940 vs 1.2947.
5. **Non-identifiability.** At `K`=optimal, `d`=0 identifies only `a−bK`=0.077; the simulated regression is singular. For `n`=1000, sd(b̂) = 0.632/0.316/0.105/0.032 at `d`=0.05/0.1/0.3/1 and corr(â,b̂) = +0.998…+0.76: the estimates are almost collinear, so small dither yields a precise pole but a poor `b`.
6. **Retune** (300 repetitions per row, twin gain running with dither): from `m`=0.5 (regret 0.404) at `d`=1, mean regret 0.0070/0.0018/0.00049/0.00011 at `n`=100/400/1,600/6,400 against delta-method 0.0073/0.0018/0.00045/0.00011; at `d`=0.3, 0.0888/0.0129/0.0032/0.0007 against 0.046/0.0116/0.0029/0.0007 (the asymptotic law is optimistic at small `n` where 2/300 estimates failed). From `m`=2 (regret 0.205): `d`=1 mean 0.0052/0.0013/0.00031/0.00007. Regret·`n` is roughly constant at large `n`.
7. **Price of dither.** Exact excess per step at `m`=0.5 over the undithered 1.508: 0.016/0.145/1.608 at `d`=0.1/0.3/1. With a 50,000-step horizon, total excess `n·(collection excess) + H·J*·regret` is minimised on the tested grid at `d`=0.5 for `n`=400 (605) and `d`=0.3 for `n`=1,600 (1,081); the delta-method regret is used for the deployment term.

## Limitations
Scalar plant with known `a`; multivariable systems have richer ways to be unidentifiable and unstable. The twin is wrong in `b` only, gains are fixed (no adaptation during collection), and there is no saturation, delay, or unmodelled dynamics (see `latency-twin`, `timestep-twin`). Statement 2's band is found by grid scan plus bisection, not derived beyond the `r→0` limit. The `1/n` retune law is confirmed by simulation and the delta method, not proven; the dither optimum is a grid search at one setting. No robot data. Preliminary.

## Next steps
Closed-form band edges for `r>0`; robust (min-max over a twin uncertainty set) design versus dithered retuning; excitation designed to be safe (bounded regret during collection); the multivariable case; scoring twin claims of stability with the tools of `twin-elicitation`.

## References
- Kalman, R. E. (1960). Contributions to the theory of optimal control. *Boletín de la Sociedad Matemática Mexicana*.
- Anderson, B. D. O., Moore, J. B. (1971). *Linear Optimal Control*. Prentice-Hall.
- Åström, K. J., Wittenmark, B. (1995). *Adaptive Control*, 2nd ed. Addison-Wesley.
- Ljung, L. (1999). *System Identification: Theory for the User*, 2nd ed. Prentice-Hall.
