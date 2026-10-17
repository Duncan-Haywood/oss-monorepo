# A ground-effect-blind twin of a rotorcraft altitude loop

## Question
Near the ground a rotor's thrust at fixed power rises. A twin that omits this predicts a hover on target and unchanged stability margins. How far off is that for a gravity-feedforward altitude hold, and where does a loop designed on the twin become unstable?

## Model
Unit mass, `z̈ = G(z)T_c − g`, `T_c = g + k_p(z_r − z) − k_d ż`, `G(z) = 1/(1 − (R/4z)²)` (Cheeseman & Bennett 1955), `R = 0.1 m`, used for `z ≥ R/2`. Hover equilibrium `z_e`: `G(z_e)(g + k_p(z_r − z_e)) = g` (bisection). Linearising about `z_e` gives `δ̈ = −G k_p δ − G k_d δ̇ − (G′/G) g δ`; the last term is a restoring stiffness `S = −G′g/G > 0` from thrust falling with height and, unlike the controller terms, is not delayed. The sampled loop (`dt = 0.02 s`, semi-implicit Euler, controller sees the previous sample) has state `(δ, v, δ_prev, v_prev)`; its spectral radius is found from the Faddeev–LeVerrier characteristic polynomial and Durand–Kerner roots, and the gain margin is the largest multiplier on `(Gk_p, Gk_d)` with spectral radius below 1 (bisection). First-order offset: `(G−1)g/(Gk_p + S)` at `z_r`.

## Results
(all from `experiments/results.txt`)
1. **Offset.** `k_p = 25, k_d = 7`: exact offset 2.68, 5.79, 9.63, 17.70, 26.39, 30.17 mm at `z_r/R = 3, 2, 1.5, 1, 0.7, 0.6` (0.9%, 2.9%, 6.4%, 17.7%, 37.7%, 50.3% of `z_r`); a nonlinear 8 s simulation ends on the same value (to the printed 0.01 mm). First-order law: 2.68, 5.78, 9.52, 16.45, 20.60, 20.83 mm (accurate to 0.1 mm for `z_r ≥ 2R`, 7% low at `R`, 22% at `0.7R`). The twin predicts 0.
2. **Stability.** `k_p = 400, k_d = 28`, one-sample delay: twin margin 1.2755 at every height. Real margin: 1.2663, 1.2546, 1.2378, 1.1897, 1.1420, 1.1028, 1.0457, 1.0073 at `z_r/R = 3, 2, 1.5, 1, 0.8, 0.7, 0.6, 0.55`; boundary at `z_r = 0.542 R`. Spectral radius at designed gains rises 0.906 (twin) to 0.909, 0.932, 0.961, 0.982, 0.997.
3. **Stiffness term.** Margin with `S = 0` (gain scaling `G` only): 1.2667, 1.1981, 1.1254, 1.0795, 1.0492 at `3, 1, 0.7, 0.6, 0.55` — higher than the full model by 0.0004, 0.008, 0.023, 0.034, 0.042, so modelling only the thrust gain misplaces the boundary (with `S = 0` the loop is still stable at `0.505R`, margin 1.0165).
4. **Nonlinear check.** A 2 mm perturbation about `z_e`, 20 s, final `|z − z_e|`: ~1e-14 mm at `z_r ≥ 0.7R`, 2e-9 mm at `0.6R`, 1.4e-5 mm at `0.57R`, 0.0226 mm at `0.55R` (decaying, slowly), diverges at `0.53R` and `0.5R`; the twin simulation settles at every height.
5. **Derating.** Largest scale on `(k_p, k_d)` keeping the real loop stable: 1.2663, 1.1893, 1.1016, 1.0446, 1.0070 at `3, 1, 0.7, 0.6, 0.55R`, i.e. 0.72%, 6.76%, 13.64%, 18.11%, 21.05% below the twin's 1.2755. (Margins in items 2 and 5 agree because scaling the designed gains moves `z_e` only slightly.)

## Limitations
Stylised, no flight data. Point-mass vertical axis, closed-form constant-power ground-effect model (constant-thrust and fitted multirotor models differ, and the model is singular at `R/4`), no rotor or motor lag, a single one-sample delay, one gain set, one rotor radius (heights scale with `R` only if the delay and gains are rescaled). The experiments do not test whether the sign of the stability effect survives rotor lag. The twin is a naive baseline; an identified `G(z)` would reproduce the real numbers by construction. The contribution is the size and the closed-form location of the error, not a new controller.

## Next steps
Identify `G(z)` from logged landings and compare to the closed form; add an integrator (see `windup-twin`) and rotor lag; gain-schedule on `G(z)` and measure the landing-phase benefit; extend to ceiling and wall effects and to a multi-rotor frame.

## References
- Cheeseman, I. C., Bennett, W. E. (1955). The effect of the ground on a helicopter rotor in forward flight. Aeronautical Research Council R&M 3021.
- Sanchez-Cuevas, P., Heredia, G., Ollero, A. (2017). Characterization of the aerodynamic ground effect and its influence in multirotor control. *International Journal of Aerospace Engineering*, 1823056.
- Åström, K. J., Murray, R. M. (2008). *Feedback Systems*. Princeton University Press.
