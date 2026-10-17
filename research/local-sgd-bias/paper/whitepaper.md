# Exact bias and step-count inflation in local-SGD-style averaging for decentralised training

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Low-communication training (local SGD, DiLoCo-style outer averaging) is attractive for networks of heterogeneous, poorly connected devices. We analyse the simplest solvable case, workers with quadratic objectives `f_i = a_i(x−c_i)²/2` that each take `H_i` local steps and are then averaged. The fixed point is available in closed form: a weighted mean of the workers' optima with weights `w_i = 1−(1−ηa_i)^{H_i}` that saturate at 1. Consequences: (i) plain averaging is exactly unbiased at `H=1` and converges to the unweighted mean of optima as `H→∞`, with a bias that is not monotone in `H`; (ii) reweighting workers by `a_i/w_i` removes it exactly; (iii) if the server trusts reported step counts, a worker can move the fixed point by inflating its claim, which links communication savings to verification of work; (iv) under a bias tolerance the wall-clock-optimal `H` has a non-interval feasible set. Noise formulas are checked by Monte Carlo. This is a stylised model, not a claim about deployed systems.

## 1. Model
Worker `i` runs `H_i` steps `y ← y − η(a_i(y−c_i)+σξ)` from the shared point, the server sets `x ← Σ p_i y_i` (default `p_i=1/n`). With `q_i=1−ηa_i`, one round is `x ↦ mx + Σ p_i w_i c_i + noise`, `m = Σ p_i q_i^{H_i} = 1−Σ p_i w_i`. The fixed point is `x* = Σ p_i w_i c_i / Σ p_i w_i`; the global optimum is `x_opt = Σ a_i c_i/Σ a_i`. Stationary variance is `V/(1−m²)` with `V=Σ p_i² η²σ²Σ_{j<H_i} q_i^{2j}`. Everything is exact; tests check the fixed-point property and Monte Carlo of mean and variance.

## 2. Bias
At `H=1`, `w_i=ηa_i` so `x*=x_opt` (plain gradient descent). As `H→∞` all `w_i→1` and `x*` tends to the *unweighted* mean of the `c_i`: curvature, hence how much each worker's data constrains the solution, is forgotten. In the example (`n=8`, `η=0.05`) the bias is 0 at `H=1`, −0.010, −0.036, −0.066, −0.094 at `H=2,5,10,20`, −0.092 at 50, −0.045 at 100, then changes sign (+0.062 at 500) and saturates at +0.0625 (E1). So bias is **not monotone** in `H` and has a sign change, which means a bias tolerance does not define an interval of acceptable `H`. It is bounded by the spread of the optima. Equal curvatures give zero bias at every `H` (tested); the bias is a heterogeneity effect.

## 3. An exact correction
Weights `p_i ∝ a_i/w_i` give `Σ p_i w_i c_i/Σ p_i w_i = x_opt` for any `H_i` (tested with heterogeneous `H_i`; E2 residual ≈10⁻¹⁶). It requires curvature (or Fisher) information per worker, which a server rarely has and which reported values could game; for quadratic models it is the analogue of step-count normalisation methods in federated optimisation. The corrected weights also contract faster in the example (0.084 vs 0.214 per round at `H=50`).

## 4. Step-count inflation
If workers do different numbers of steps per round (fast devices in a fixed time window), `w_i` grows with `H_i`, so more steps means more influence. In E4 (8 workers, honest steps 5–20) a worker with `a=0.5, c=−2` moves the fixed point from 0.504 to 0.312, 0.022 and −0.016 by claiming 20, 100 and 1000 steps; a worker with `a=0.25,c=3` moves it to 0.618, 0.911, 1.049. The lever saturates (`w_i≤1`) but is large. Any protocol that aggregates by work done therefore needs the work to be verified (cf. `reproducible-refereed-training`, `spot-check-slashing`); communication-saving and verifiability are linked. In E4 the honest heterogeneous-step bias (0.004) happens to be tiny because fast workers also have high curvature in that instance; this is instance-specific, not a general benefit.

## 5. Wall-clock optimum
With per-step time 1 and per-round communication `C`, time to contract the deterministic error by `10⁻³` is `ln(1/ε)/(−ln m) · (H+C)`. Under bias tolerance `tol` the best feasible `H` is found by search (E3): at `C=20`, `tol=0.05` gives `H*=95` and `t=344` versus `t=1945` at `H=1` (5.7×); at `C=500`, `tol=0.2`, the search hits the cap `H=1000` (63× faster). Because of the sign change, the best feasible `H` at `tol=0.01` is 140–168 (near the zero crossing) even though `H=20–50` are infeasible; such crossings are instance-specific and not robust to changed data, so we would not tune to them.

## 6. Noise
Server-iterate variance grows only mildly with `H` in the example (0.00056, 0.00066, 0.00104 at `H=1,6,30`); simulation matches within 1–5% (E5). Large `H` is thus a small variance penalty here; its cost is the bias above.

## 7. Limitations
1-D quadratics, full participation, plain averaging (no outer momentum or Nesterov step as in DiLoCo), independent noise, identical `η`. The non-convex, high-dimensional case can differ; qualitative claims (curvature forgotten at large `H`, work-proportional influence) should be tested there. Related: `gossip-consensus`, `churn-checkpointing`, `delayed-routing`, `robust-aggregation`. Contributions: closed-form fixed point and contraction, non-monotone bias, exact correction, step-count inflation and its verification implication, with executable checks.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (8 tests) and `PYTHONPATH=src python3 experiments/run.py`.
