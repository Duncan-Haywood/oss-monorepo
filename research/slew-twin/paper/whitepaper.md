# The twin whose actuator has no rate limit: exact only below `A = r/k`, and larger commands overshoot and settle in O(amplitude) time

*Stylised: a scalar integrator with a first-order-lag command loop, pure Python, every number is from `experiments/results.txt` (deterministic, 0.3 s). The "real" system is itself simulated; no lab or field data. Statements not proved are marked as empirical.*

## Question
Real actuators cannot change their output arbitrarily fast (motor drivers, hydraulic valves, servo slew limits). A twin that omits the rate limit behaves as a linear system, so its normalised response does not depend on how large the manoeuvre is. Over what range of amplitudes is such a twin exact, and what does the real loop do outside it?

## Model
Plant `x⁺ = x + a⁺`; command `a⁺ = a + clip(−k x − a, −r, r)`, `0 < k ≤ 1`, `a₀ = 0`. The twin has `r = ∞`, so `a⁺ = −kx` and `x⁺ = (1−k)x`: first order, monotone, never crosses zero, normalised settling time independent of `x₀`.

**Scale invariance (exact).** Scaling `(x₀, r)` by `c` scales the whole real trajectory by `c` (the map is positively homogeneous). The real response therefore depends only on `k` and `ρ = x₀/r`, while the twin depends on `k` alone; a validation at one amplitude says nothing about another unless `ρ` is matched. The test suite checks this bit-exactly with a power-of-two `c`.

**Twin validity amplitude (exact).** The twin's command increments are `−k x₀` at `t=0` and `k² x_{t−1} > 0` afterwards; since `k² ≤ k` the largest magnitude is `k x₀`. The rate limit never engages iff `x₀ ≤ A = r/k`, and then the real loop equals the twin exactly. The condition is checkable from the twin alone: simulate it, read off its largest command increment, and compare with `r`.

## Results
1. **Validity boundary.** At `0.999A` the real trajectory equals the twin's (max difference 0, k = 0.1, 0.3, 0.6, r = 0.05, 300 steps). At `1.01A` the largest difference is 0.099% / 0.297% / 0.594% of `x₀` (k = 0.1 / 0.3 / 0.6); at 2A it is 5% / 15% / 30% and at 10A 26% / 48% / 66%. Increment ratio computed by simulation equals `k` to six digits.
2. **Overshoot the twin cannot show.** Real undershoot past zero, as a fraction of `x₀`, at `ρ` = 10 / 100 / 1000 / 10⁴: k=0.1: 0 / 0 / 0.296 / 0.742; k=0.3: 0 / 0.232 / 0.751 / 0.904; k=0.5: 0 / 0.440 / 0.849 / 0.932; k=0.8: 0.280 / 0.690 / 0.901 / 0.960. The twin's is 0 at every `ρ`. Large manoeuvres reverse almost their whole length.
3. **Overshoot threshold (empirical).** For `k = 1/n` the smallest `ρ` at which the loop crosses zero, by bisection to 60 halvings, is `ρ* = 2n(2n−1)`: 2, 12, 30, 56, 90, 132, 240, 380, 992, 2450 for n = 1, 2, 3, 4, 5, 6, 8, 10, 16, 25, equal to the formula in every case (the unit tests check n = 1, 2, 3, 5, 10 with ±10⁻⁶). For other `k` no such closed form was found: 2.25 (0.9), 2.667 (0.8), 3.5 (0.7), 6.75 (0.6), 39.75 (0.3), 160.105 (0.15), against `2(2−k)/k²` = 2.72, 3.75, 5.31, 7.78, 37.78, 164.4. I did not prove any of this, and bisection assumes crossing is monotone in `ρ`.
4. **Settling time is O(ρ), not O(log).** Steps to reach and stay within 1% of `x₀` (r=1): twin 44 / 13 / 7 at k = 0.1 / 0.3 / 0.5. Real at `ρ` = 10 / 100 / 10³ / 10⁴ / 10⁵: k=0.1: 44 / 48 / 112 / 1001 / 9961; k=0.3: 14 / 34 / 310 / 2833 / 29418; k=0.5: 9 / 53 / 535 / 6149 / 52451. The slope between 10⁴ and 10⁵ is 0.0996 / 0.2954 / 0.5145 steps per unit `ρ`, near `k` for the first two (no derivation).
5. **A twin validated at small amplitude (k=0.3, r=0.05, `A` = 0.167).** Twin says 13 steps at any size. Real: 13 steps at x₀ = 0.1 and 0.16, 14 at 0.5 (ρ=10), 12 at 2 (a 0.5% undershoot happens to finish sooner), 65 at 10 with 44.5% undershoot. So agreement on a few small runs, or even at moderate size, is not evidence at large size.
6. **Sizing.** To keep the twin exact for `x₀ = 10`: `r ≥ k x₀` (3.0 at k=0.3, 1.0 at k=0.1). To merely avoid overshoot, `r ≥ x₀/ρ*`: 0.252 (k=0.3) and 0.026 (k=0.1). The second is about 12× and 38× smaller than the first.

## Limitations
Scalar plant, no noise, no delay, symmetric limits, no saturation of the amplitude, `a₀ = 0`. The rate limit sits on the command of a first-order-lag loop; a plant with its own dynamics would change the constants and could destabilise (Stein 2003 discusses rate limiting in unstable loops). The threshold `2n(2n−1)` is verified numerically for the listed `n` only. Results 2–5 are single deterministic runs of the discrete map, not statistical estimates. Not evidence about any particular actuator.

## Next steps
Prove the `2n(2n−1)` threshold and find the general-`k` form; a second-order plant where rate limiting can destabilise; joint amplitude and rate limits (link to `saturation-twin`); estimating `r` from a few large real commands and the sequential test in `twin-audit`; anti-windup or reference shaping that restores the twin's validity.

## References
- Stein, G. (2003). Respect the unstable. *IEEE Control Systems Magazine* 23(4), 12–25.
- Åström, K. J. and Murray, R. M. (2008). *Feedback Systems: An Introduction for Scientists and Engineers*. Princeton University Press.
