# Thermal twin: a constant-gain twin of a motor holding a load certifies every load, what does the real thermal feedback do?

*Stylised: a lumped one-node thermal model, pure Python, every number is from `experiments/results.txt` (deterministic, about 4 s). The "real" system is itself simulated; no measured motor data. Out-of-model and slow-converging results are marked.*

## Question
Twins of robot joints and propellers usually take the actuator gain as a constant. A joint that holds a load (an arm against gravity, a hovering rotor) dissipates `R i²` continuously, heats, and loses torque constant as magnets warm; holding then needs more current, which heats more. What load does a constant-gain twin certify, what does the real loop do, and can a short test reveal the difference?

## Model
Real: `C θ' = R(θ) i² − θ/Rth`, `k(θ) = k0(1 − αθ)`, `R(θ) = R0(1 + βθ)`, hold `k(θ) i = τ`. Set `φ = αθ`, `c = R0 Rth/k0²`, `λ = αcτ²`, time in units of `Rth C`, `b = β/α`. Then `φ' = λ(1 + bφ)/(1 − φ)² − φ`. Twin: `α = β = 0`, steady `φ = λ`, no dynamics beyond a first-order lag. For `b = 0`, steady states solve `φ(1−φ)² = λ`; the left side peaks at `φ = 1/3` with value `4/27`, so a hold exists iff `λ ≤ 4/27` and the stable branch is `φ < 1/3`. Near the fold `g(φ) ≈ (9/4)(ε + (φ − 1/3)²)`, `ε = λ − 4/27`, so passage takes `≈ 4π/(9√ε)` (a saddle-node "ghost"; Strogatz 2015). Results use RK4 (dt = 10⁻³) and midpoint quadrature of `∫dφ/g`.

## Results
1. **Steady hold.** Real `φ` (twin `φ = λ`): 0.0102 (0.01), 0.0320 (0.03), 0.0693 (0.06), 0.1330 (0.10), 0.2064 (0.13), 0.2467 (0.14); ratio real/twin 1.02, 1.07, 1.15, 1.33, 1.59, 1.76; current ratio `1/(1−φ)` 1.01 to 1.33. At the fold `φ = 1/3` against the twin's 0.148: 2.25× temperature, 1.5× current. The root satisfies `φ(1−φ)² = λ` to 10⁻¹⁷ and the integrated dynamics reach it (0.3178 against 0.3212 at `λ = 0.148` and t = 40; critical slowing down, not an error). For `λ = 0.15, 0.16, 0.2` there is no steady hold.
2. **Runaway.** Above the fold `φ` reaches 0.999 (torque constant nearly gone) in finite time: 30.0, 10.5, 5.58, 3.98, 1.74, 0.84, 0.37 `Rth C` at `λ` = 0.15, 0.16, 0.18, 0.2, 0.3, 0.5, 1 (RK4 agrees to about 10⁻³). The ghost formula is an asymptotic: quadrature/formula ratio 0.83, 0.94, 0.982, 0.994 at `ε` = 10⁻², 10⁻³, 10⁻⁴, 10⁻⁵, converging like `√ε`, and poor far from the fold (0.49 at `λ = 0.3`). So 10% overload above the fold gives about 9 `Rth C`; slightly above, hundreds.
3. **Detectability.** Time for the real current to exceed the twin's by 5% (`φ = 0.0476`): 2.13, 0.60, 0.39 `Rth C` at `λ` = 0.05, 0.10, 0.14; never at `λ = 0.02` (steady `φ = 0.021`). A 0.1 `Rth C` test at `λ = 0.14` sees `φ = 0.0135`, +1.4% current. Tests shorter than the thermal time constant certify the twin; tests at light load do too, and neither says anything about the fold.
4. **Certified torque.** With a winding temperature limit `φ_m` the twin admits `λ ≤ φ_m`, the real system `λ ≤ φ_m(1−φ_m)²` for `φ_m ≤ 1/3` and `4/27` above, so the twin overstates holdable torque by 1.053, 1.111, 1.250, 1.500, 1.643, 2.012, 2.324× at `φ_m` = 0.05, 0.1, 0.2, 1/3, 0.4, 0.6, 0.8. Illustration only (not datasheet values): `α = 0.001/K`, 100 K limit gives `φ_m = 0.1`, 1.11×; `α = 0.004/K` gives 1.64×.
5. **Refit does not fix it.** Matching a constant `k_eff = k0(1−φ_fit)` to a hot low-load steady state predicts `φ = λ/(1−φ_fit)²`. Fitted at `λ` = 0.03, 0.06, 0.10 and tested at `λ = 0.14` (real 0.2467) it gives 0.149, 0.162, 0.186 (errors −0.097, −0.085, −0.061); it is exact only at the fit load, and at `λ = 0.16` it predicts a hold (0.213) where none exists.
6. **Resistance.** With `b = β/α` = 0, 0.5, 1, 1.5, 3 the fold `λ_max` = 0.1481, 0.1278, 0.1134, 0.1024, 0.0807 (the fold temperature falls from `φ = 0.333` to 0.229). Copper resistance rises about 0.4%/K, larger than typical magnet derating, so `b > 1` is plausible for a hot winding; this is a textbook magnitude, not measured here.

## Limitations
One thermal node (no winding/housing split, no fast hot-spot transient), linear derating and resistance, constant load, constant ambient, no controller saturation, no cooling change with temperature, no noise; hold current is assumed to track `τ/k(θ)` exactly (a torque controller with feedback), whereas an open-loop current command would instead sag. The "real" system is simulated, so model-form error is untested. The ghost formula is only a leading-order result. Not evidence about a particular motor.

## Next steps
Two-node thermal models and the sub-second hot-spot transient; duty-cycled loads (a twin of average power vs the fold); thermal-aware trajectory planning and what a twin-trained policy does when it holds poses too long; combining with `windup-twin` (current limit plus derating) and `uav-energy-twin`; fitting `α`, `β`, `Rth`, `C` from logged current and temperature and the excitation needed to locate the fold.

## References
- Strogatz, S. H. (2015). *Nonlinear Dynamics and Chaos*, 2nd ed. Westview Press.
- Pyrhönen, J., Jokinen, T. & Hrabovcová, V. (2008). *Design of Rotating Electrical Machines*. Wiley.
- Åström, K. J. & Murray, R. M. (2008). *Feedback Systems: An Introduction for Scientists and Engineers*. Princeton University Press.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
