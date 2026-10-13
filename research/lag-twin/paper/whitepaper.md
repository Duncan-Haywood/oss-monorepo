# A twin with an instantaneous actuator promises any bandwidth: first-order lag sets a hard stability limit and a hard speed limit

*Stylised: a unit mass under a PD loop with a first-order actuator, pure Python, every number is from `experiments/results.txt` (deterministic, about a minute). The "real" system is itself simulated; no lab or field data. Out-of-model and negative results are marked.*

## Question
Digital twins of robots routinely treat the actuator as an ideal force source. If a controller is tuned in such a twin for speed (high natural frequency `ωn`), how much lag `τ` can the real actuator have before the loop is unstable, what does it do before that, and how fast can the real loop go at all?

## Model
Real: `ẍ = u`, `τ u̇ = u_cmd − u`, `u_cmd = −kp x − kd v`, with `kp = ωn²`, `kd = 2ζωn`. Twin: `τ = 0`, characteristic polynomial `s² + kd s + kp` (stable for every positive gain, decay rate `ζωn`, overshoot `exp(−πζ/√(1−ζ²))`). Real: `τ s³ + s² + kd s + kp`. Everything depends only on `ζ` and `ε = ωnτ` (time scaling).

## Results
1. **Exact stability limit.** By Routh the real loop is stable iff `kd > τ kp`, i.e. `τ < τ* = kd/kp`, equivalently `ε < 2ζ`. This matched the root locations (Durand–Kerner) in all 168 combinations of ζ ∈ {0.1 … 5}, ωn ∈ {0.1 … 100}, τ/τ* ∈ {0.5 … 2}. The twin is stable everywhere, so it cannot flag the limit.
2. **It hunts at the twin's own frequency.** At `τ = τ*` the roots are `±jωn` (boundary |Im s| = 1.000000000, 1.000000000, 10.000000000, 3.000000000 for four (ζ, ωn) pairs): the real hunt oscillates at the frequency the twin reports as its natural mode. Just beyond the limit `d Re s/dτ = ωn²/(2(1+4ζ²))` (derived by implicit differentiation). For ζ = 0.3, 0.7, 1, 2 the formula (0.367647, 0.168919, 0.100000, 0.029412) equals the numeric slope to six digits; the growth rate measured from the peaks of an RK4 simulation at `τ = 1.05τ*` (0.010676, 0.011201, 0.009467, 0.005588) matches the root real part to ≤ 1·10⁻⁶.
3. **Before the limit the step test barely notices (and the twin looks fine).** At ζ = 0.7, ωn = 1 (τ* = 1.4): ε = 0.1 gives real overshoot 4.7% vs the twin's 4.6%, and dominant decay rate 0.755 vs the twin's 0.700, *faster* than promised. Overshoot then rises with ε: 7.1% (0.3), 15.2% (0.5), 29.9% (0.8), 39.0% (1.0), 47.2% (1.2), and the dominant-pole damping ratio falls 0.696, 0.572, 0.333, 0.156, 0.088, 0.038 toward 0 at ε = 1.4. The twin's step-response RMS error is ≈ 0.04 ε (0.0393 at ε = 0.01, 0.0592 at ε = 0.5): first order in the lag, so a twin validated on a gentle test passes with small lag and still hides a cliff at ε = 1.4.
4. **Faster is not better.** At τ = 0.05, ζ = 0.7 the twin's decay rate `ζωn` grows without bound (19.6 at ωn = 28), but the real rate rises to 4.84 at ωn = 8 and then falls: 3.49 (14), 1.95 (20), 0.96 (24), 0 (28), negative beyond. Across ζ = 0.3 … 2 the best ε for the decay rate was 0.27, 0.375, 0.357, 0.526, 0.921, 1.276 (0.26–0.46 of the limit 2ζ); the optimum is not sharp and was found on a 0.1%-of-limit grid.
5. **An exact speed limit.** The three poles sum to `−1/τ`, so the largest real part is at least `−1/(3τ)`: no choice of `(kp, kd)` decays faster than `1/(3τ)`, with equality iff a triple pole, `kd = 1/(3τ)`, `kp = 1/(27τ²)` (ωn = 1/(√27 τ), ζ = √3/2). Random search over 2·10⁵ log-uniform gains at τ = 0.05 reached 6.66601 against the bound 6.66667; the triple-pole gains gave 6.666636. For ζ ≥ 1 the grid search in result 4 found 0.3331–0.3333 (units 1/τ). The twin instead promises `ζωn`, exceeding the cap for `ωn > 1/(3τζ)` (9.52 at ζ = 0.7, τ = 0.05).
6. **Design rule.** Requiring the true lag to stay below a fraction `m` of the limit needs `ωn ≤ 2ζm/τmax`. At ζ = 0.7, τmax = 0.05: m = 1, 0.75, 0.5, 0.25, 0.1 gives ωn ≤ 28, 21, 14, 7, 2.8 with real decay 0, 1.70, 3.49, 4.90, 2.19. Margin costs speed only beyond roughly m ≈ 0.25.

## Limitations
Linear, scalar, one lag, exact PD structure, noiseless and delay-free (delay is `latency-twin`, rate limits `slew-twin`), no saturation, no sampling; the "real" plant is the same family as the twin apart from τ, so model-form error is not tested. The optimal-ε values are numerical, not closed form; only the `1/(3τ)` cap and the stability/growth results are analytic. Not evidence about any particular actuator.

## Next steps
Identify τ from logged step or chirp data and quantify the data needed for a safe margin; lag plus delay and lag plus saturation (hunting amplitude limit cycles); a twin that models the lag only approximately (Padé) versus not at all; bandwidth limits for cascaded motor-current-velocity loops.

## References
- Åström, K. J. & Murray, R. M. (2008). *Feedback Systems: An Introduction for Scientists and Engineers*. Princeton University Press.
- Khalil, H. K. (2002). *Nonlinear Systems*, 3rd ed. Prentice Hall.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
