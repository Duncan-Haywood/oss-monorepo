# A twin with no gear backlash says the loop converges; the real loop hunts

*Stylised: a scalar discrete PI loop on a velocity-commanded motor with a symmetric gap between motor and load; pure Python, every number is from `experiments/results.txt` (deterministic, under 2 s). The "real" system is itself simulated; no lab or field data. Negative and out-of-model results are marked.*

## Question
Gear backlash (play) is common in manipulators, gimbals and steering. A twin that models the drivetrain as rigid (`y = m`) predicts that a stable linear PI loop converges to zero error. If the real drivetrain has a gap of half-width `h`, does the real loop converge, how large is any residual oscillation, and can the twin's own analysis tools (describing functions) recover it?

## Model
Load `y` follows motor position `m` through the play operator `y+ = max(m−h, min(m+h, y))`. Loop: `z+ = z + y`, `m+ = m − kp·y − ki·z+` (integrator plant, PI on the measured load position). For `h = 0` the characteristic polynomial is `z² − (2−kp−ki)z + (1−kp)`; the twin claims convergence whenever its spectral radius is below 1. With `h > 0` the loop is piecewise linear and positively homogeneous, so any limit cycle scales exactly with `h`. Harmonic balance replaces the gap by its describing function for a motor sinusoid of amplitude `A ≥ h`, with `c = 1−2h/A`: `N(A) = [π/2 + arcsin c + c√(1−c²)]/π − j·(4h/(πA))(1−h/A)`, a gain below 1 and a phase lag, and solves `1 + N(A)G(e^{jω}) = 0` with `G(z) = (kp + ki z/(z−1))/(z−1)`.

## Results
1. **The describing function is right.** The closed form matches the numerical first harmonic of `play(A sin)` to 1.2·10⁻⁷ over `A/h` = 1.2…30. The fitted "gain" is excitation-dependent, `|N|` = 0.208 / 0.593 / 0.881 / 0.991 at `A/h` = 1.2 / 2 / 5 / 30, with lags of 58.2° / 32.5° / 13.4° / 2.4°: a twin identified from large motions reports gain near 1 and negligible lag, and misses that small motions see a weak, delayed actuator.
2. **The twin's convergence claim fails.** For five gain settings with twin spectral radius 0.707–0.894 (twin error below 1e-145 at 3000 steps), the real loop from `x0 = 10h` settles on a limit cycle of motor amplitude 1.30 / 1.67 / 1.54 / 1.38 / 2.94 `h` with period 30 / 25 / 18 / 41 / 15 steps (`(kp,ki)` = (0.5,0.1), (0.3,0.1), (0.5,0.2), (0.3,0.05), (0.2,0.2)). A twin-based tolerance below roughly `1.3h` is never met, at any run length.
3. **Exact scaling.** The amplitude divided by `h` is 1.302317 for `h` = 0.01, 1 and 100 (same at all printed digits), as homogeneity requires: the hunting error is set by the gap alone, not by the disturbance or initial condition.
4. **Harmonic balance is useful but not exact.** It overestimates the amplitude by 6.7–10.1% (e.g. 1.424 vs 1.302) and underestimates the period by 6–13% in all five cases. This is the expected accuracy of a first-harmonic approximation on a discrete loop, not a defect specific to backlash; the sign is consistent here but five cases are too few to claim a rule.
5. **Bistability (a negative result for any single-run validation).** At `(kp,ki) = (0.5,0.05)` the loop hunts (amplitude 1.1654`h`) from `x0/h` = 1.5…8 but decays to zero (printed 0.0000) from `x0/h` = 10 and 100; at `(0.8,0.1)` it hunts from `x0/h ≤ 5` and converges from 6 and above. At `(0.5,0.1)` it hunts from every start tried. Harmonic balance predicts a cycle in all three (1.261, 1.233, 1.424) but not which starts reach it. A validation experiment that starts from a large step, the usual choice, can therefore see convergence in a configuration that hunts after a small perturbation.
6. **Integral gain.** With `kp = 0.5`, raising `ki` from 0.01 to 0.4 raises the small-start amplitude from 1.04`h` to 1.96`h` (twin radius 0.980 → 0.707 → 0.707); the large-start run converges for `ki ≤ 0.05` and hunts for `ki ≥ 0.1`. Lowering `ki` shrinks but did not remove the cycle in the sweep.

## Limitations
Single symmetric gap, known shape, no measurement noise, no load dynamics or friction, one loop structure, five gain settings for the amplitude comparison and three for bistability; no confidence intervals (the simulations are deterministic, so there is no sampling noise, but generality across plants is untested). The basin boundary in result 5 is reported at the granularity of the start values tried. The describing-function result concerns amplitude and period of the cycle, not its stability, which is only established here by simulation. The stylised loop is not evidence about any particular gearbox.

## Next steps
Compensating the gap with an estimated `ĥ` (companion to `deadband-twin`, where under- and over-compensation behave differently); measurement noise and dither as in `deadband-noise-twin`; joint backlash and Coulomb friction; certifying an amplitude bound from the twin plus a measured `h` (link to `twin-certification`); the basin boundary as a function of `(kp, ki)` in closed form.

## References
- Nordin, M. & Gutman, P.-O. (2002). Controlling mechanical systems with backlash: a survey. *Automatica* 38(10), 1633–1649.
- Gelb, A. & Vander Velde, W. E. (1968). *Multiple-Input Describing Functions and Nonlinear System Design*. McGraw-Hill.
- Brokate, M. & Sprekels, J. (1996). *Hysteresis and Phase Transitions*. Springer.
- Khalil, H. K. (2002). *Nonlinear Systems*, 3rd ed. Prentice Hall.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
