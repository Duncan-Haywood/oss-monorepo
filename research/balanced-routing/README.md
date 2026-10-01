# Balanced routing as a congestion-priced market

Stdlib-only Python. Capacity-constrained expert routing (MoE load balancing) as a cost-function market: the balancing multipliers are congestion prices, and a price vector is a checkable certificate. See `paper/whitepaper.md`.

```bash
cd research/balanced-routing
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~3 s
PYTHONPATH=src python3 experiments/run.py                  # a few minutes (E3 B=4096 sweep dominates); output in experiments/results.txt
```
Results: the entropic capacity-constrained router is a softmax with per-expert prices `p_i ≥ 0` (Lagrange multipliers), the dual is a smooth concave problem (gradient checked, step `2τ/B` guaranteed); any `p` yields a computable upper bound `D(p)` and a feasible-primal lower bound, so a verifier certifies near-optimality from prices alone (needs `c_i > 1/N`). Sign-update ("aux-loss-free") balancing has a sampling floor `≈2.5/√B` (max relative overload, `N=8`) that no step size removes, and a fixed-batch limit cycle of size ∝ γ. Two-expert Gaussian price of balance is closed form (price shift = the median gap); a Hoeffding audit of `⌈ln(2N/δ)/(2ε²)⌉` tokens covered 400/400. Stylised synthetic scores, not a trained MoE; MIT.
