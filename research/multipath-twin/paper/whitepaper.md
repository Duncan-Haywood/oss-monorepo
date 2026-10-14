# A free-space radar twin misses the ground-bounce lobing: it detects 100% inside its range where the real system detects 2/3 at the edge, and a slightly mis-heighted two-ray twin can be worse than free space

## Question
Radar detection-range estimates in a simulator often use free-space propagation. Over a reflecting surface the real return is modulated by lobing. How wrong is the free-space twin, how accurately must a two-ray twin know its geometry before it is better, and what should a twin report when it cannot know the geometry to a fraction of a wavelength?

## Model
Real: flat earth, reflection coefficient −1, small grazing angles. Path difference `2 h_r h_t/r`; with `u = 2π h_r h_t/(λ r)` the two-way power relative to free space is `16 sin⁴ u` (peak 16, mean 6, nulls 0). Free-space SNR `T (r_fs/r)⁴`; the target is detected iff `16 sin⁴ u ≥ c(r) = (r/r_fs)⁴`. Parameters: λ = 0.03 m, h_r = 30 m, h_t = 100 m, r_fs = 10 km (20 lobes inside `r_fs`).
For uniform phase, `sin⁴ u ≥ c/16` holds on a fraction `f(c) = 1 − (2/π) asin((c/16)^{1/4})` (0 for `c ≥ 16`). A height error `δh` shifts `u` by `2π h_r δh/(λ r)`; two arcs of length `πf` on a circle of period `π` offset by `δ` disagree on `2(L−overlap)/π`, which is `2δ/π` for small `δ`. Twins: free space (detect iff `r ≤ r_fs`); mean-gain (detect iff `c ≤ 6`); deterministic two-ray with height `h_t + δh`; ensemble of two-ray draws with `h ~ N(h_t+δh, σ²)`.

## Results
(all numbers from `experiments/results.txt`)
1. **Lobe statistics.** Mean gain 6.000000; `f(1) = 2/3` exactly; `f(6) = 0.428`, `f(15) = 0.114`.
2. **Free-space twin.** In 0.25–1.0 `r_fs` the real system misses 20.4% of ranges; in 1.0–2.0 `r_fs`, where the free-space twin never detects, it detects 43.9%. Band detection rates (real / closed-form integral): 0.78/0.77 (0.5–0.9), 0.65/0.69 (0.9–1.0), 0.72/0.65 (1.0–1.1). The bands contain only one to four lobes, so the simulated and closed-form rates differ by up to 0.14 in the narrowest bands; I did not use more lobes to tighten this. The mean-gain twin removes the bias in the mean power but still declares certain detection for `r < 1.565 r_fs` (real: 0.33–0.78 by band).
3. **Height error.** In 0.95–1.05 `r_fs`, deterministic two-ray vs real disagreement is 0.008, 0.020, 0.040, 0.100, 0.200, 0.413, 0.656, 0.048 at `δh` = 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5 m (closed form 0.008, 0.020, 0.040, 0.100, 0.200, 0.400, 0.667, 0.050; the last is wrap-around, a 5 m error being half a lobe period at this range). The free-space twin disagrees 0.524 and two independent copies would disagree 0.444.
4. **Where the two-ray twin loses.** At `δh = 0.5 m` disagreement of two-ray / free-space / mean-gain twin is 0.127/0.063/0.063 at 0.2 `r_fs`, 0.313/0.156/0.156 at 0.5, 0.286/0.219/0.219 at 0.7, 0.210/0.239/0.239 at 0.85, 0.200/0.524/0.333 at 1.0, 0.149/0.550/0.450 at 1.2. The crossover is near 0.8 `r_fs`, not at `r_crit = 8 h_r δh/λ = 4 km` (0.4 `r_fs`); `r_crit` marks where lobe shifts exceed a quarter period and disagreement stops being small, not where the twin becomes worse than free space. The inside-range free-space disagreement is the miss rate `1−f(c)` (0.23–0.37), which bounds what the two-ray twin must beat.
5. **Ensemble twin.** Brier in 0.9–1.1 `r_fs` for twin height +0.5 m: free space 0.533, mean-gain 0.317, deterministic two-ray 0.197; ensemble σ = 0.1, 0.25, 0.5, 1, 2, 5 m: 0.174, 0.143, 0.119, 0.140, 0.211, 0.221. The calibrated limit `f(1−f)` band-averaged is 0.222, which large σ approaches (0.221); the optimum σ is near the height error. With exact geometry the ensemble only hurts (σ = 0.5: 0.051 vs 0). With a 1 m error the best σ is 1 m (0.209 vs 0.392 deterministic).

## Limitations
Stylised, no radar data. Perfect reflection, flat earth, no curvature, noise, target fluctuation (Swerling), ground roughness or diffuse multipath; detection is a hard threshold, so "probability" comes only from phase uncertainty. Bands have few lobes, so band-averaged closed forms are approximate. One geometry and wavelength; single seed for the ensemble (200 draws per range). The Brier comparison uses the twin height error as given; in practice the error is unknown and σ would have to be fitted from data.

## Next steps
Noisy detection with Swerling targets; rough-surface reflection coefficient; fitting σ from logged detection maps; 3-D terrain multipath (`terrain-twin`); feeding the ensemble probability into the certification pipeline (`twin-certification`).

## References
- Skolnik, M. I. (2008). *Radar Handbook*, 3rd ed. McGraw-Hill.
- Barton, D. K. (2013). *Radar Equations for Modern Radar*. Artech House.
- Brier, G. W. (1950). Verification of forecasts expressed in terms of probability. *Monthly Weather Review* 78(1).
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
