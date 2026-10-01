# Ladder twin: how should a simulation budget be split across twin fidelities?

Pure Python, no dependencies. A twin usually comes in several fidelities (here: explicit-Euler fixed step `n_l = 2^(l+1)`), each run costing `n_l` steps and carrying a bias that shrinks with `n_l`. Multilevel Monte Carlo (MLMC) estimates the finest-level answer by telescoping `E f_L = E f_0 + Σ E(f_l − f_{l−1})`, running many cheap coarse pairs and few expensive fine ones on shared scenario draws. Worked system: `x' = −λx`, `λ ~ U(1,3)` (unknown drag), `T=1`. Every level bias and level variance is computed exactly (closed form or quadrature), so allocation and cost are exact, and simulation checks them. Two quantities of interest: the smooth terminal state `E[x_T]`, and a failure probability `P(x_T > e^{−1.1}) = 0.05` (an indicator, so `λ_c(n) = n(1−c^{1/n})` gives its level means and variances in closed form).

- **Smooth quantity: the ladder pays, more the tighter the target.** Bias rate α = 1.000, level-variance rate β = 2.001, cost rate γ = 1 (β > γ). Steps to reach RMSE ε (bias ≤ ε/√2, variance ≤ ε²/2): single fixed-step twin 10,240 / 8.1M / 360M / 2.9e11 versus MLMC 2,882 / 287k / 3.2M / 3.2e8 at ε = 1e-2 / 1e-3 / 3e-4 / 3e-5, i.e. 3.6× / 28× / 112× / 897×. Simulation (200 runs) gives RMSE 0.84ε and 0.94ε for MLMC at ε = 1e-2 and 3e-3.
- **Failure indicator: the saving collapses.** The level variance only falls like the bias (β = 1.000 = γ), because a coarse and fine twin disagree on a fraction `∝ h` of scenarios. Savings are 0.4× (MLMC *loses*) at ε = 3e-2, 0.9× at 3e-3, 1.2× at 1e-3, 2.9× at 3e-4, 7.7× at 1e-4. Coarse twins (`n` = 2, 4) claim zero failures deterministically.
- **Allocation matters.** Equal samples per level cost 156× (smooth) and 3.9× (failure) more than the optimal `N_l ∝ √(V_l/C_l)` at ε = 1e-3. A coarse twin alone has a large bias (−48%, −20%, −10% of `E[x_T]` at `n` = 2, 8, 16) that no number of runs removes.

See `paper/whitepaper.md`.

```bash
cd research/ladder-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```

**Builds on.** The simulation-based evaluation and sim-to-real directions of ARPG (<https://arpg.colorado.edu/>), RECUV (<https://www.colorado.edu/recuv/>) and the HIRO group (<https://hiro-group.ronc.one/>), where simulator fidelity trades off against run cost. No specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. MLMC is due to Heinrich (2001) and Giles (2008; survey in Giles 2015); multifidelity estimation is surveyed by Peherstorfer, Willcox and Gunzburger (2018). Companion to `timestep-twin` (fixed-step overshoot, Richardson repair), `twin-evaluation` (biased twin as one control variate for real evaluation), `crn-twin` (shared scenario draws) and `scenario-twin` (rare-failure importance sampling) in this repository.

Stylised: one scalar linear system with a one-parameter scenario law, cost counted in Euler steps (no fixed overhead per run), exact level moments known (in practice estimated from pilots), and no real robot data; the twin's discretisation is the only fidelity axis. Preliminary. MIT.
