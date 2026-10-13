# A linear-actuator twin of a saturating unstable plant: exponentially optimistic time to loss of control

*Stylised: scalar plant. Pure Python; every number is from `experiments/results.txt` (seeded, ~25 s). Exit times are numerical solutions of an integral equation (checked against grid refinement and Monte Carlo), not closed forms.*

## Question
Simulators often omit actuator limits. For an open-loop unstable plant with bounded input, how much longer does a limit-free twin say the system stays in control, and does the twin at least rank controller gains correctly?

## Method
Real plant `x' = a x + sat_U(u) + w`, `u = −Kx`, `w~N(0,s²)`, `a=1.2`, `b=1`, `U=1`. Failure is the first `|x|>L`, `L = U/(a−1) = 5`: at `x=L` full thrust gives `aL − U = L`, so outside `(−L,L)` the state cannot be pulled back. The twin has the same dynamics with no limit and the Riccati gain for `q=1`, `r=0.1` (`K=1.1026`, pole `a−K=0.097`); twin and real are compared on the same failure event. The mean exit time `T(x)` from `(−L,L)` satisfies `T(x) = 1 + ∫ p(y|x)T(y)dy`; it is discretised on `N` midpoints and solved by Gaussian elimination. `twin_sat_rate = P(|Kx|>U)` under the twin's stationary law `N(0, s²/(1−m²))`, `m=a−K`.

## Results
1. **Optimism** (`x0=0`): `s`=2/1.5/1.2/1.0/0.8: twin `T` 78/1,102/29,700/1.5×10⁶/2.0×10⁹, real 13.8/32.0/81.5/245/1,936, ratio 5.7/34/365/6,295/1.0×10⁶. At `s`≤0.7 the twin's value exceeds 10¹⁰ and is not resolvable in double precision (the solver returned non-monotone numbers, discarded); the real values remain valid (11,720 at 0.7; 1.96×10⁵ at 0.6; 2.2×10⁷ at 0.5).
2. **Exponent.** `d ln T/d(1/s²)` over `s`=1.5→0.8: real 3.74/3.61/3.64/3.70, twin 13.2/12.9/12.8/12.7. The linear twin's large-deviation exponent is `L²(1−m²)/2 = 12.38`; the measured slope is a few percent above it, consistent with a polynomial prefactor. The real exponent is empirical only (no derivation here). The consequence is that the twin's error grows exponentially in `1/s²`.
3. **Checks.** Grid: 245.84/245.52/245.48/245.47 for N=60/120/240/480. Monte Carlo (2,000 runs): real `s`=1.5 32.0 vs 32.6±0.7, `s`=2 13.8 vs 13.9±0.3; twin `s`=1.5 1,102 vs 1,078±25; twin `s`=2 78.2 vs 74.5±1.6, which is 2.3 standard errors below the solver. One of four comparisons at this level is unremarkable, but it is not evidence of agreement to better than about 5%, and I did not investigate further.
4. **Gain ranking.** Over `K` = 0.3…2.4 (step 0.1), both the twin and the real plant are maximised at `K=1.2 = a/b` (deadbeat) for `s`=0.8/1.0/1.5; real `T` at the twin's best gain equals the real best (1,948 / 246.1 / 32.0). At `s`=1, real `T` across K=0.4/0.8/1.10/1.5/1.8/2.0/2.2 is 121/229/245.5/242.7/236.6/232.6/228.8, whereas the twin's is 560/2.2×10⁵/1.5×10⁶/5.4×10⁵/1.6×10⁴/560/31. The real plant is nearly indifferent to gain above `K≈0.8` (saturation sets the ceiling); the twin sees five orders of magnitude.
5. **Warning signal.** The twin's saturation rate is 0.07/0.13/0.20/0.26/0.37/0.45/0.55/0.65 at `s`=0.5/0.6/0.7/0.8/1.0/1.2/1.5/2.0. It is never small when the real plant is short-lived, but a twin builder would need to convert it to a time-to-failure with the saturated model; it does not do so itself.

## Limitations
One scalar plant, one `(a,U)`, one failure radius; the optimum being the deadbeat gain on a gain grid (the real objective is flat there) is specific to this setting and I did not vary `a` or `U`. The real exponent is not derived. Gaussian noise is unbounded, so loss of control is certain eventually; bounded disturbances would give a different (possibly infinite-`T`) picture. Values of twin `T` above ~10¹⁰ are unresolved, so the slope table (E6) stops at `s`=0.8. No robot or hardware data. Preliminary.

## Next steps
Derive the real exponent from the quasi-potential of the saturated dynamics; vary `a` and `U` to see where the deadbeat coincidence breaks; multivariable plants with directional saturation; anti-windup and saturation-aware designs in the twin; a proper score for twin claims of time-to-failure (see `twin-elicitation`).

## References
- Freidlin, M. I., Wentzell, A. D. (1984). *Random Perturbations of Dynamical Systems*. Springer.
- Hu, T., Lin, Z. (2001). *Control Systems with Actuator Saturation: Analysis and Design*. Birkhäuser.
- Kalman, R. E. (1960). Contributions to the theory of optimal control. *Boletín de la Sociedad Matemática Mexicana*.
- Anderson, B. D. O., Moore, J. B. (1971). *Linear Optimal Control*. Prentice-Hall.
