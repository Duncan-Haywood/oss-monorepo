# A ladder of twin fidelities: multilevel budget allocation is a large win for smooth quantities and a small one for failure probabilities

*Stylised: `x' = −λx`, `λ ~ U(1,3)`, `T = 1`; twin level `l` is explicit Euler with `n_l = 2^(l+1)` steps. Pure Python; every number is from `experiments/results.txt` (seeded; level moments exact, simulations 200 repetitions, so RMSE ratios carry ≈5% sampling error).*

## Question
A digital twin can be run at several fidelities. Given a target RMSE ε on a real-world quantity, is it better to run one fixed twin fine enough to make its bias negligible, or to spread the budget over a ladder of fidelities, and how?

## Method
Level `l` has cost `C_l` (steps; a coupled pair `(l,l−1)` costs `n_l + n_{l−1}`), bias `b_l = E f_l − θ`, and increment variance `V_l = Var(f_l − f_{l−1})` with both levels driven by the same `λ` (common random numbers). MLMC estimates `θ ≈ Σ_l mean_l(f_l − f_{l−1})`. For RMSE ε we take the smallest `L` with `|b_L| ≤ ε/√2` and `Σ V_l/N_l ≤ ε²/2`; the cost-minimising allocation is `N_l = ⌈(2/ε²) √(V_l/C_l) Σ_k √(V_k C_k)⌉`. The single-level baseline uses the same `L` and `N = ⌈2 Var(f_L)/ε²⌉`. With bias, variance and cost rates `2^(−αl)`, `2^(−βl)`, `2^(γl)` the asymptotic cost is `O(ε⁻²)` for β > γ, `O(ε⁻²log²ε)` for β = γ, and `O(ε^(−2−(γ−β)/α))` for β < γ (Giles 2008), against `O(ε^(−2−γ/α))` for a single level. Here `E f_l` is exact (`∫(1−λ/n)^n dλ`), `V_l` by Simpson quadrature for the smooth quantity `f_l = (1−λ/n_l)^{n_l}`, and for the failure indicator `1{x_T > c} = 1{λ < λ_c(n)}`, `λ_c(n) = n(1−c^{1/n})`, exactly `P(disagree) − (p_l − p_{l−1})²` with `p_l = (λ_c(n_l) − 1)/2`. Truth: `E[x_T] = (e⁻¹−e⁻³)/2 = 0.1590`, `P(λ<1.1) = 0.05`.

## Results
1. **Rates.** Fitted at levels 10–11: smooth α = 1.000, β = 2.001; failure α = 1.000, β = 1.000; γ = 1.
2. **Smooth quantity.** Single-level vs MLMC steps at ε = 1e-2/3e-3/1e-3/3e-4/1e-4/3e-5: 10,240 vs 2,882 (3.6×); 225,792 vs 31,520 (7.2×); 8.1M vs 287k (28×); 360M vs 3.2M (112×); 6.5e9 vs 2.9e7 (225×); 2.9e11 vs 3.2e8 (897×). The saving grows about like 1/ε, as the O(ε⁻³) versus O(ε⁻²) rates predict. Simulation: MLMC RMSE 8.4e-3 at ε=1e-2 (0.84ε) and 2.8e-3 at 3e-3 (0.94ε); single level 0.81ε and 1.01ε; mean errors are negative (the twin's bias) at about ε/2–0.6ε.
3. **Failure probability.** MLMC steps vs single: 2,468 vs 1,088 at ε=3e-2 (0.4×, MLMC loses); 113k vs 55k at 1e-2 (0.5×); 3.07M vs 2.64M at 3e-3 (0.9×); 38.5M vs 48.1M at 1e-3 (1.2×); 731M vs 2.16G at 3e-4 (2.9×); 10.0G vs 77.8G at 1e-4 (7.7×). With β = γ the increments do not get cheaper fast enough: `N_l` stays large at every level (e.g. 47.8M, 38.1M, 19.5M, 9.8M, … at ε = 1e-4). Levels 0–1 claim no failures at all (`λ_c(2) < 1`), so they carry no variance and no information. Simulation at ε = 3e-2 and 1e-2 matches the targets (RMSE 0.98ε and 0.79ε for MLMC; 0.93ε and 0.81ε single).
4. **Allocation.** At ε = 1e-3 equal `N_l` at every level costs 44.7M steps vs 287k optimal for the smooth quantity (156×) and 150M vs 38.5M for the failure indicator (3.9×).
5. **A coarse twin alone** has bias −47.6% / −40.6% / −20.0% / −9.9% / −4.9% of `E[x_T]` at `n` = 2/4/8/16/32; its failure claim is 0 / 0 / 0.014 / 0.032 / 0.041 against a real 0.050. More runs at that level shrink variance, never bias.

## Limitations
One scalar linear system where the level increments are exact functions of one scenario parameter; real twins (contact, rendering, learned dynamics) may have no clean α, β, γ, or a fixed per-run overhead that flattens the cost ladder. Exact `V_l` and `b_l` are used; in practice they come from pilot runs, and estimation error in `V_l` misallocates (not studied here). The bias of the finest level is assumed known for choosing `L`; MLMC normally estimates it from increments. The failure quantity uses a discontinuous indicator; smoothing it (e.g. a smooth margin) restores β > γ but changes the estimand. The savings compare step counts, not wall clock. Fidelity here is the integrator step only, not modelling error against the real system, which no ladder removes (see `twin-evaluation`, `twin-transfer`).

## Next steps
Pilot-estimated variances and adaptive level choice; combine with the importance-sampling generator of `scenario-twin`; a ladder over qualitatively different fidelities (contact model, sensor model) with estimated rates; a smoothed failure margin; comparison with the control-variate estimator of `twin-evaluation` and with Richardson extrapolation from `timestep-twin`.

## References
- Heinrich, S. (2001). Multilevel Monte Carlo methods. *Large-Scale Scientific Computing*, LNCS 2179, 58–67.
- Giles, M. B. (2008). Multilevel Monte Carlo path simulation. *Operations Research* 56(3), 607–617.
- Giles, M. B. (2015). Multilevel Monte Carlo methods. *Acta Numerica* 24, 259–328.
- Peherstorfer, B., Willcox, K., Gunzburger, M. (2018). Survey of multifidelity methods in uncertainty propagation, inference, and optimization. *SIAM Review* 60(3), 550–591.
