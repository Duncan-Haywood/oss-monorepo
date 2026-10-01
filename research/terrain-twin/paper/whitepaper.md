# A twin with independent per-cell friction certifies a stopping distance that spatially correlated terrain exceeds far more often than claimed

*Stylised: Gamma-distributed patch friction, one patch length, work–energy braking. Pure Python; every number is from `experiments/results.txt` (seeded, ~15 s). The "real" terrain is itself simulated; no robot or field data.*

## Question
A terrain twin is often a grid map whose cells carry friction drawn independently from the measured marginal distribution. A stopping-distance or safe-following-distance certificate computed there averages many cells and so concentrates near the mean-friction distance. Real friction is spatially correlated (soil type, moisture and surface change over metres). How wrong is the certificate when the marginal is right but the correlation length is not?

## Model
Deceleration is `g·μ(x)`, so `v² = v0² − 2g∫μ` and the robot stops at the first `D` with `∫₀^D μ = W0 := v0²/2g`. Friction is piecewise constant on patches of length `L`, i.i.d. Gamma with shape `k` and mean `m` (CV `k^{-1/2}`; `k=4` here). `d0 = W0/m`. Start on a patch boundary. Then `D > s ⇔ ∫₀^s μ < W0`, and for `s = jL` the mean friction over the `j` patches is Gamma(`jk`, mean `m`), so
`P(D > s) = P(jk, jk·c/m)`, `c = W0/s`,
with `P` the regularised lower incomplete gamma function (implemented in `src/terrain_twin/model.py`, tested against the exponential, erf and Poisson-sum special cases). A twin with `n` independent cells across the distance has the same law with `j → n`; its level-`δ` certificate is `s*(δ,n) = d0/q_δ(n)` with `q_δ(n)` the lower `δ`-quantile of the mean of `n` patches (mean-1 normalised). The real exceedance of that certificate is `P(jk, jk/(s*/d0))`. The number of patches across the distance, `j`, is held fixed while `s` varies (a fixed-point simplification; exact at each tabulated distance).

## Results
1. **Certificate and real exceedance** (`δ=10⁻³`, `k=4`). The certified distance is 1.720/1.173/1.051/1.016·d0 for `n`=10/100/1000/10⁴ twin cells. On real terrain with `j`=1/3/10/30/100 patches across it, the real exceedance is, for `n=100`, 0.444/0.33/0.176/0.0474/0.001 (equal to the claim only at `j=n`); for `n=1000`, 0.528/0.471/0.399/0.307/0.168. Finer twin cells give a smaller certificate and a worse real miss: at `n=10⁴` the single-patch exceedance is 0.554. A coarse twin (`n=10`) is conservative for `j≥10` (0.001 at `j=10`, 3·10⁻⁸ at 30) and still wrong for `j<10`.
2. **Distance actually required.** Real terrain with `j`=1/2/3/5/10/30/100/1000 patches needs 9.33/4.06/2.97/2.23/1.72/1.35/1.17/1.05·d0, which is 8.88/3.86/2.83/2.13/1.64/1.28/1.12/1.00× what the `n=1000` twin certifies (1.051·d0).
3. **Spread.** For an `n=1000` twin, delivered exceedance at `j`=1/3/10 is 0.556/0.487/0.407 (`k=2`), 0.528/0.471/0.399 (`k=4`), 0.503/0.457/0.391 (`k=10`), 0.488/0.448/0.387 (`k=25`): lower friction spread shrinks the certificate (1.073 → 1.020·d0) but the exceedance stays near 0.4–0.55 because the certificate is then close to the mean distance.
4. **Mean versus tail** (braking simulation, random start phase, 20 000 runs). `E[D]/d0` = 1.002/1.004/1.011/1.036/1.116/1.214/1.322 and `P(D>1.2·d0)` = 0.0001/0.0128/0.114/0.255/0.371/0.408/0.431 for `L/d0` = 0.01/0.03/0.1/0.3/1/3/100. The single-patch limit of the mean is `k/(k−1)=1.333` (Jensen; tested to ±0.02). A twin validated on mean stopping distance passes at every correlation length.
5. **Closed form versus simulation** (aligned start, 200 000 runs): 0.1429/0.1173/0.1433 predicted vs 0.1434/0.1168/0.1428 simulated at (`j`, `s/d0`) = (1, 2.0), (4, 1.4), (10, 1.2).
6. **Repair.** With true `j=4`, a twin rebuilt with `j_est` patches across the distance certifies 9.33/4.06/2.50/1.85/1.52/1.05·d0 at `j_est`=1/2/4/8/16/1000 and is exceeded with probability 5·10⁻¹¹/4·10⁻⁶/0.001/0.0161/0.0694/0.455. Matching `j` recovers the level exactly; understating the correlation length is safe but wasteful (1.6× the required distance at `j_est=2`); overstating it by 2× and 4× gives 16× and 69× the claimed risk.

## Interpretation
Averaging over many independent cells is what makes the twin's tail thin, and it is exactly what correlated terrain removes. Validation on means (or on the mean stopping distance) cannot detect the gap. The tail certificate is governed by the number of independent patches across the stopping distance, so the quantity to measure from logs is the friction correlation length relative to `d0`; the twin then needs correlated cells (or patch-wise sampling) with that length. Because the error is one-sided in `j_est`, an under-estimate of the correlation length is the dangerous direction.

## Limitations
Piecewise-constant i.i.d. Gamma patches; the exactness needs `s = jL` and an aligned start (random phase breaks exact closed form, so item 4 is simulation only); no speed-dependent friction, slip, slope, vehicle dynamics, sensing latency or reaction distance; the correlation is captured by one patch count, not a continuous covariance; `j` is treated as fixed as `s` varies. The real terrain is simulated: the check in item 5 validates the algebra, not the model. No field data, no estimation of `j` from noisy friction logs (item 6 assumes it is known or mis-known by a factor).

## Next steps
Estimate the patch length from noisy friction measurements and propagate that uncertainty into the certificate; Gaussian-process (Matérn) friction fields instead of patches; speed-dependent friction and reaction distance; an ARPG-style off-road twin in a real simulator with logged wheel-slip data; combine with `safety-twin` (heavy tails) and `autocorr-twin` (run-length).

## References
- Wong, J. Y. (2008). *Theory of Ground Vehicles* (4th ed.). Wiley.
- Press, W. H., Teukolsky, S. A., Vetterling, W. T. & Flannery, B. P. (2007). *Numerical Recipes: The Art of Scientific Computing* (3rd ed.). Cambridge University Press. (Incomplete gamma function.)
- Tobin, J., Fong, R., Ray, A., Schneider, J., Zaremba, W. & Abbeel, P. (2017). Domain randomization for transferring deep neural networks from simulation to the real world. *IROS*.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
