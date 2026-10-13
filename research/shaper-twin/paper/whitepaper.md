# Input shaping a twin's move: robustness of a slosh-safe plan to a stale frequency calibration

## Question
`slosh-twin` showed that a rigid-body twin of a cart carrying liquid predicts no slosh, that a null-tuned move (duration a whole number of double slosh periods) is safe only if the twin's slosh frequency is right, and that a stale calibration at low fill pushed the smallest safe null-tuned move from 8 s to 28 s. Can the twin instead plan its usual minimum-time move and shape it, and how does the shaped move depend on the calibration error?

## Model
Same real system as `slosh-twin`: cart `M = 80 kg`, one damped slosh mode (`m_full = 20 kg`, `ω_full = π rad/s`, stiffness `k = κm`, so `ω² = κ(1+m/M)` depends on fill `f`). The twin plans a rest-to-rest bang-bang move, `D = 3 m`, `|a| ≤ 0.5 m/s²`, duration `T₀ = 2√(D/a_max) = 4.899 s`, tolerance 1 cm on the residual amplitude. A shaper is a set of impulses `(A_i, t_i)` with `A_i ≥ 0`, `ΣA_i = 1`; the shaped acceleration is `Σ A_i a(t − t_i)`. Distance is unchanged (`ΣA_i = 1`) and `|a| ≤ a₀` still holds (a convex combination of shifted copies). For an undamped mode the slosh response is linear, so the residual phasors superpose: `R_shaped = V(ω)·R_bangbang` with `V = |Σ A_i e^{iωt_i}|`. ZV uses `A = (½, ½)` at `t = 0, π/ω_m`, giving `V = |sin(πε/2)|`; ZVD uses `A = (¼, ½, ¼)` at `0, π/ω_m, 2π/ω_m`, giving `V = sin²(πε/2)`, with `ε = ω/ω_m − 1`. Damped variants use the standard `K = exp(−ζπ/√(1−ζ²))` weights (Singer & Seering 1990). Slosh is propagated exactly over the piecewise-constant segments of the shaped command; shaped time is `T₀ + t_last`. Pure Python.

## Results
(all numbers from `experiments/results.txt`)
1. **Multiplicative law.** At fills 1, 0.5, 0.25 (design at the full-tank frequency) the exact shaped residual equals `V(ε)` times the unshaped residual to the six printed digits, e.g. 0.004837 m (ZV, `f = 0.5`, `ε = −5.13%`) and 0.000389 m (ZVD). Unshaped residuals at this `T₀` fall with fill (0.1066, 0.0601, 0.0395 m at `f = 1, 0.5, 0.25`).
2. **Robustness to a stale calibration.** With the twin calibrated at a full tank, every fill `f ∈ {0.9, 0.75, 0.5, 0.25, 0.1}` (`ε` from −1.0% to −9.5%) is within tolerance for both shapers: ZV residual at most 4.8 mm, ZVD at most 0.62 mm. Times are 5.899 s (ZV) and 6.899 s (ZVD), against `slosh-twin`'s null-tuned 8.00 s (down to `f = 0.5`) and 28.00 s (`f ≤ 0.25`), or 8.0–8.8 s if recalibrated at each fill. The shaper costs one half slosh period (ZV) or one period (ZVD) of extra time at the design frequency.
3. **Tolerated frequency error.** With `ρ = tol/R` (R = unshaped residual at that fill), the largest tolerated `|ε|` is `(2/π)asin ρ` (ZV) and `(2/π)asin√ρ` (ZVD), valid for `ρ < 1`. At `f = 0.5` (`ρ = 0.166`): 10.7% and 26.8%; at `f = 0.9` (`ρ = 0.103`): 6.6% and 20.8%. The actual `ε` at each tested fill is smaller than both.
4. **Damping.** At real `ζ = 0.05` and full tank, unshaped residual 0.0774 m; undamped-design ZV 5.62 mm and ZVD 0.41 mm (inside tolerance, but not null); damped-design shapers give 0 at the exact design frequency at costs of 5.900 s and 6.901 s; damped ZV with design frequency off by ±2% leaves 2.30 mm, ±5% leaves 5.75 mm.
5. **Fill-band design (caution).** Searching the design frequency (0.88–1.68 × `ω_full`, step 0.005) for the shortest shaped move whose worst residual over a fill band is ≤ 1 cm gives, for bands [0.5,1], [0.25,1] and [0.1,1]: ZV 5.847 s (design 1.055 `ω_full`), ZVD 6.505 s (1.245), best null-tuned 8.000 s (band [0.5,1]), 8.219 s and 8.362 s. The ZV/ZVD solutions detune on purpose to shorten the shaper and use the tolerance almost fully (9.88 mm, 9.87 mm), so they have no margin against any other error source; the result depends on the grid, and the null-tuned orders found at `ω_m > ω_full` exploit the same freedom.

## Limitations
One linear undamped-to-lightly-damped slosh mode; the multiplicative law is exact only for the undamped mode (damped results are numerical). Ideal actuator and bang-bang base profile; no jerk limits, no smooth or optimised shapers (EI, time-optimal). Fill dependence assumes `k ∝ m`. The tolerance is on modal amplitude, not a spill criterion. The "real" system is a model, not measured data, so nothing transfers to hardware. The fill band is a uniform worst case, with no prior over fill.

## Next steps
Extra-insensitive (EI) and optimised shapers against the same sweep; nonlinear slosh with amplitude-dependent frequency; estimating `ω` online from the cart residual (`twin-recalibration`); a two-mode tank; choosing the design frequency by expected cost under a fill prior rather than worst case.

## References
- Smith, O. J. M. (1957). Posicast control of damped oscillatory systems. *Proceedings of the IRE*, 45(9), 1249–1255.
- Singer, N. C. & Seering, W. P. (1990). Preshaping command inputs to reduce system vibration. *ASME J. Dynamic Systems, Measurement, and Control*, 112(1), 76–82.
- Ibrahim, R. A. (2005). *Liquid Sloshing Dynamics: Theory and Applications*. Cambridge University Press.
