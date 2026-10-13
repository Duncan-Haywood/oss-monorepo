# A twin with gusts matched to the logged variance understates a PD-held vehicle's position variance by `2(a+k_d)/(dt(a²+a k_d+k_p))`; matching the spectrum instead overstates it, always

## Question
A common way to put wind into a vehicle twin is to draw an independent gust every step from a distribution with the variance seen in logs. That matches the marginal of the wind but not its time structure. How wrong is the twin's position-error variance for a feedback-held vehicle, how does the error depend on the twin's own step, what margin does a safety certificate then get, and does the alternative of matching the spectral density do better?

## Model
Real: `x'' = −k_p x − k_d x' + d`, with `d` Ornstein–Uhlenbeck, `d' = −a d + √(2a s²) w`, marginal variance `s²`, correlation time `1/a`. Stationary variance from the Lyapunov equation of the joint state `(x, x', d)` (solved symbolically; also solved numerically from the exact Van Loan discretisation):
`Var_real = s²(a + k_d) / (k_d k_p (a² + a k_d + k_p))`.
Twin A (variance matched): `d_k` iid `N(0, s²)`, held over each step `dt`; exact zero-order-hold discretisation, stationary variance by the doubling algorithm; for small `dt` it equals `s² dt/(2 k_d k_p)`, the white-noise formula `q/(2k_d k_p)` with `q = s² dt`.
Twin B (spectrum matched): white noise with `q = 2s²/a`, the real density at zero frequency; `Var = s²/(a k_d k_p)`.
Hence `Var_real/Var_A = 2(a+k_d)/(dt(a²+a k_d+k_p))` and `Var_real/Var_B = a(a+k_d)/(a²+a k_d+k_p) < 1`. Pure Python; parameters `k_p=1, k_d=1.4` (natural frequency 1 rad/s, damping 0.7), `s²=1`.

## Results
(all numbers from `experiments/results.txt`)
1. **Variance-matched twin.** At `dt = 0.01`, real/twin variance is 270×, 242×, 141×, 62×, 19.8×, 4.0× at `a` = 0.05, 0.2, 1, 3, 10, 50; the closed form reproduces the exact discrete twin value. Slower gusts are worse. A plausible reading (not separately tested) is that the twin spreads its variance over a band up to `1/dt`, nearly all of which the loop filters out, whereas the real gust's power sits at frequencies the loop passes.
2. **The twin's answer depends on its step.** At `a = 1` the twin's standard deviation is 0.189, 0.0598, 0.0189 at `dt` = 0.1, 0.01, 0.001 against a real value of 0.710, i.e. it scales as `√dt`; real/twin std is 3.8, 11.9, 37.6. The step at which the continuum formula would happen to be exact is `dt* = 1.41 s`, far coarser than any usable step for this loop.
3. **Spectrum-matched twin.** Real/twin variance is 0.068, 0.242, 0.706, 0.930, 0.991, 1.000 at the same `a` values; it is always below 1 and tends to 1 only for fast gusts. Its error does not depend on `dt`.
4. **Safety margin.** For exceedance probability 1e-3 at `a = 1` (Gaussian `x`): twin A margin 0.197, real 2.337, twin B 2.781. The real system exceeds twin A's margin with probability 0.78 and twin B's with 9·10⁻⁵ (conservative by 19% in margin).
5. **Monte Carlo check.** Exact-discretisation simulations (4·10⁵ steps, one seed) give real/closed-form 0.965, 0.989, 0.968 at `(a, dt)` = (0.2, 0.05), (1, 0.05), (5, 0.02) and twin/exact 1.005, 1.005, 1.000. The real ratios sit 1–4% low; with correlation times up to 5 s and 2·10⁴ s of data this is of the order of the sampling error, but I did not quantify it over seeds.
6. **Fix.** Fitting an OU gust from logged wind at 0.1 s spacing (lag-1 autocorrelation and sample variance) gives a predicted variance within 1.045, 0.807, 1.103, 0.989 of the real one at 10², 10³, 10⁴, 10⁵ samples (one seed per length).

## Limitations
Linear second-order loop with unit mass; one gust axis; Gaussian OU gusts, so the variance calculation gives exceedance probabilities only through the Gaussian assumption (`safety-twin` covers heavy tails); no actuator limits, delay or measurement noise; the "real" system is a model and no wind data were used. The fit in Result 6 uses one seed per log length, so its sampling spread is not characterised. A twin using a smoother stochastic input, or one filtered to a correlation time near the loop's natural period, would fall between A and B; I did not study it. Whether the twin's step dependence matters in practice depends on whether gust force is applied per step, which varies between simulators.

## Next steps
Multi-axis coupling (`coupling-twin`); gusts entering through drag on a moving vehicle, not as an additive force; a von Kármán spectrum in place of OU; using the wind-fit variance penalty as an input to the twin-certification pipeline in `twin-certification`; testing against logged UAV wind data.

## References
- Åström, K. J. (1970). *Introduction to Stochastic Control Theory*. Academic Press.
- Gardiner, C. (2009). *Stochastic Methods: A Handbook for the Natural and Social Sciences*, 4th ed. Springer.
- Van Loan, C. F. (1978). Computing integrals involving the matrix exponential. *IEEE Transactions on Automatic Control* 23(3).
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
