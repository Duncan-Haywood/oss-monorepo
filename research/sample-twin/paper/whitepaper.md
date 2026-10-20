# A continuous-time twin certifies PD at every gain; the real sampled loop is stable only while `ωnT < min(4ζ, 1/ζ)`

*Stylised: a PD loop on a double integrator, pure Python, every number is from `experiments/results.txt` (deterministic, about 2 s). The "real" system is itself simulated; no lab or field data. Negative and out-of-model results are marked.*

## Question
Digital twins are usually built and tuned in continuous time, while real controllers compute on a clock and hold their command between samples. A PD loop on a double integrator is stable at every positive gain in continuous time. Which gains survive a zero-order hold with period `T`, and how wrong is the twin's performance promise before the loop goes unstable?

## Model
Real: `x'' = u`, `u_k = −kp x_k − kd v_k` held on `[kT, (k+1)T)`. Exact discretisation: `x⁺ = x + Tv + T²u/2`, `v⁺ = v + Tu`, step matrix trace `2 − kdT − kpT²/2`, determinant `1 − kdT + kpT²/2`. Jury: `1 − tr + det = kpT² > 0` always, `det < 1 ⇔ kd > kpT/2`, `1 + tr + det = 4 − 2kdT > 0 ⇔ kd < 2/T`, and `det > −1` is then implied. So the loop is stable iff `kpT/2 < kd < 2/T`; with `kp = ωn²`, `kd = 2ζωn` this is `ωnT < 4ζ` and `ωnT < 1/ζ`. Twin: `T → 0`, stable for all positive gains. Overshoot is taken over the continuous inter-sample trajectory; 2% settling is the last sample at which the state norm `√(x² + (v/ωn)²)` exceeds 2% of `x0` (norm rather than `x` alone, because `x` alone can miss a weakly excited slow mode). Initial condition `(x0, v0) = (1, 0)`.

## Results
1. **Boundary.** The critical `ωnT` is 1, 2, 1.4286, 1, 0.5, 0.25 for ζ = 0.25, 0.5, 0.7, 1, 2, 4, equal to the bisection on the eigenvalue modulus to six digits. An RK4 simulation of the continuous plant with held input (independent of the step matrix) shows `max |x_k| = 1` (no growth) at 0.98× critical and growth to 10⁶ and beyond in 3000 periods at 1.02× (values from 4·10⁶ to float overflow). For ζ = 0.7 the loop is lost at `ωnT = 1.4286`, 4.40 samples per natural period, and more heavily damped loops fail earlier because `kd T < 2` binds: ζ = 4 fails at `ωnT = 0.25`.
2. **Promise versus reality, ζ = 0.7.** The twin's overshoot is 0.0460 and settling 6.41 (time in `1/ωn`, twin simulated at `T = 10⁻³`). Real overshoot / settling: 0.0461 / 6.35 (`ωnT` = 0.05), 0.0463 / 6.30 (0.1), 0.0467 / 6.20 (0.2), 0.0499 / 5.50 (0.5), 0.0763 / 4.00 (1), then 0.234 / 6.00 (1.2), 0.353 / 14.3 (1.3), 0.485 / 72.8 (1.4), 0.513 / 247 (1.42); unstable from 1.45. Real pole modulus against the twin's `e^{−ζωnT}`: 0.651 vs 0.705 (0.5), 0.316 vs 0.497 (1), 0.200 vs 0.432 (1.2), then 0.625 vs 0.403 (1.3), 0.918 vs 0.375 (1.4). The twin is a good model for `ωnT ≲ 0.2` (overshoot within 0.0007) and its overshoot claim fails well before stability does: 5× at `ωnT = 1.2`.
3. **Faster is not better.** At `T = 0.1`, ζ = 0.7, raising `ωn` = 1, 2, 4, 8, 10, 12, 14, 14.14, 14.3, 16, 20 makes the twin settle in 6.41, 3.20, 1.60, 0.80, 0.64, 0.53, 0.46, 0.45, 0.45, 0.40, 0.32. The real loop settles in 6.3, 3.1, 1.4, 0.6, 0.4, 0.5, 5.2, 10.2, never, never, never. The real optimum on this grid is near `ωn = 10` (`ωnT` = 1, settling 4 samples); beyond `ωnT = 1.43` the loop diverges.
4. **Design on the discrete model.** Poles `ρe^{±iφ}` need `kpT² = 1+ρ²−2ρcosφ`, `kdT = (3−2ρcosφ−ρ²)/2` (checked: eigenvalue modulus equals ρ to six digits for four pairs at `T = 0.2`). Deadbeat (`ρ = 0`) is `kpT² = 1`, `kdT = 3/2` (here `kp = 25`, `kd = 7.5`, `ωn = 5`, ζ = 0.75): state after two samples is `(1.1·10⁻¹⁶, 0)`, settling 2T = 0.4, overshoot 0. This is the real speed limit; the twin's "faster is better" has no counterpart past it.

## Limitations
One double-integrator plant with a fixed, known period, no computation delay (a delay of a fraction of `T` would shrink the region further, see `latency-twin`), no quantisation, no noise, exactly known plant; the real plant differs from the twin only by sampling, so model-form error is untested. The 2% settling metric is sampled; the `ωnT ≲ 0.2` validity threshold in result 2 is read off a coarse grid and depends on the tolerance chosen. The Jury reduction is classical and given here only to fix the notation; nothing here is evidence about a particular controller or clock.

## Next steps
Computation delay and jitter (period uncertainty) in the same region; plants with a lightly damped mode (combine with `flex-twin`); emulation (Tustin) designs against direct discrete design; multi-rate loops (fast inner, slow outer) and what a twin with one global step hides; identifying `T` and delay from logs.

## References
- Åström, K. J. & Wittenmark, B. (1997). *Computer-Controlled Systems: Theory and Design*, 3rd ed. Prentice Hall.
- Franklin, G. F., Powell, J. D. & Workman, M. L. (1998). *Digital Control of Dynamic Systems*, 3rd ed. Addison-Wesley.
- Jury, E. I. (1964). *Theory and Application of the z-Transform Method*. Wiley.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
