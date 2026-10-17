# The twin whose actuator has no deadband: the real loop stalls at d/k, and the twin cannot tell you

*Stylised: a scalar integrator servo `x+ = x + dz(u)`, `u = −k x`, with a symmetric deadband `d`; pure Python, every number is from `experiments/results.txt` (seeded, under 2 s). The "real" system is itself simulated; no lab or field data. Negative and out-of-model results are marked.*

## Question
Actuators with stiction, backlash or a command deadband ignore small commands. A twin that models the actuator as an identity map (or as a linear gain fitted from data) predicts that a proportional loop converges to zero error. What does the real loop do, what gain does a linear fit recover, and how many real probes does it take to remove the error?

## Model
Deadband `dz(u) = u − d·sgn(u)` for `|u| > d`, else 0. Loop `x_{t+1} = x_t + dz(−k x_t)`, `0 < k ≤ 1`. For `x > d/k` the state moves by `−(kx − d)`, so `e = x − d/k` contracts by `(1−k)` and `x` never goes below `d/k`: the real loop rests at exactly `|x| = d/k`; the twin (`d = 0`) reaches `(1−k)^n x0`. For excitation `u ~ N(0, s²)`, Stein's lemma gives `E[u·dz(u)]/s² = E[dz'(u)] = P(|u| > d) = 2Q(d/s)`, the plim of a linear twin's gain. Compensation with an estimate `d̂`, command `u + d̂·sgn(u)`, leaves `(d−d̂)/k` if `d̂ ≤ d`; if `d̂ > d` (`e = d̂ − d`) the loop chatters on a period-2 orbit of amplitude `e/(2−k)`. Bisection on the command with `n` yes/no "did it move" probes on `[lo, hi]` bounds the error by `(hi−lo)/2^{n+1}`.

## Results
1. **Exact stall.** Simulated resting error equals `d/k` to printed precision: 0.100000 (d=0.05, k=0.5), 0.500000 (0.2, 0.4), 0.222222 (0.2, 0.9); the trajectory never goes below `d/k`. The twin's error is below 1e-91 at 2000 steps. (The row d=0.5, k=0.1 starts at `x0 = 5 = d/k`, exactly on the boundary, so it does not move at all; a degenerate but consistent case.)
2. **A tolerance the twin certifies but the real loop cannot meet.** For a target `ε` the real loop needs `k ≥ d/ε`. With `d=0.2, k=0.4` the twin says `|x| ≤ ε` after 5 / 7 / 10 steps for `ε` = 0.5 / 0.2 / 0.05, while the real loop rests at 0.5000 forever, so only `ε=0.5` is met. Raising the gain to the required 1.0 meets `ε=0.2` (real 0.2000); `ε=0.05` needs `k = 4`, outside the `k ≤ 1` model here (at `k=1` the real error is still 0.2000), so more gain is not a general fix.
3. **A fitted linear gain depends on excitation.** With `d=1`, the fitted gain is 0.0001 / 0.0457 / 0.3170 / 0.6164 / 0.8414 at `s` = 0.25 / 0.5 / 1 / 2 / 5, against `2Q(d/s)` = 0.0001 / 0.0455 / 0.3173 / 0.6171 / 0.8415 (n = 4·10⁵). The small-signal gain that governs the stall is 0 at every `s`, so a twin fitted on large excitation reports a gain near 1 for the region where the plant does not respond at all.
4. **Identification cost (d = 0.3137, k = 0.4, no compensation stalls at 0.7842).** Bisection with n = 0 / 2 / 4 / 6 / 8 / 12 real probes gives `|d̂−d|` = 0.186 / 0.061 / 0.030 / 0.0066 / 0.00075 / 0.00010, all within the bound, and the compensated loop rests at 0.1164 / 0.0383 / 0.0188 / 0.0041 / 0.00047 / 0.00025, equal to the exact formula in every row. About 8 probes remove 99.9% of the stall (0.7842 → 0.00047).
5. **Over- vs under-compensation** by the same `e = 0.1` (d = 0.2): at k=0.4, under-compensation rests at 0.2500 and over-compensation chatters at 0.0625 (`e/(2−k)`); at k=0.9 they are 0.1111 and 0.0909. Over-compensating is less harmful in resting error here but is a sustained oscillation of the actuator (wear, noise), which this scalar model does not price.

## Limitations
Scalar integrator, symmetric known-shape deadband, no measurement noise (noise would let the loop keep moving and turn the stall into a diffusion), `k ≤ 1` (for `1 < k < 2` the over-compensated orbit formula and the stall analysis differ), and the bisection assumes a noiseless "did it move" observation; with noise each probe needs repetition. The exact laws are the point; the stylised loop is not evidence about any particular actuator.

## Next steps
Measurement noise and the stall-versus-diffusion crossover; backlash (direction-dependent) and Coulomb friction with an integral term (hunting limit cycles); noisy bisection with a sequential test (link to `twin-audit`); pricing the chatter of over-compensation; combining with `control-twin` (wrong gain) and `saturation-twin` (missing upper limit) for the full actuator nonlinearity family.

## References
- Stein, C. M. (1981). Estimation of the mean of a multivariate normal distribution. *Annals of Statistics* 9(6), 1135–1151.
- Tao, G. & Kokotović, P. V. (1996). *Adaptive Control of Systems with Actuator and Sensor Nonlinearities*. Wiley.
- Åström, K. J. & Murray, R. M. (2008). *Feedback Systems*. Princeton University Press.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
