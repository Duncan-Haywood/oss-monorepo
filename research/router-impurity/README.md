# Router impurity

Python (uses the sibling `forgetting-law` package). Closes the open question in `forgetting-law` §6: when tasks conflict, what does a task-aware router buy? With cluster-structured conflicts the long-run loss on an old task is exactly `(2r/d)[τ_w² + τ_b²(1 − Purity)]`, where `Purity = Σ_g P(g) Σ_c P(c|g)²` is one minus the router's expected Gini impurity. Random routing to any number of modules leaves the full floor; a perfect block router removes it linearly in the number of modules (`(m−1)/(K−1)` of the between-cluster part); a router error `q` costs `2q` of impurity at first order, so a 10% routing error gives back 36% of the shared-model floor at `K=8`. Purity is auditable with an unbiased pair-collision estimator. See `paper/whitepaper.md`.

```bash
cd research/router-impurity
PYTHONPATH=src:../forgetting-law/src python3 -m unittest discover -s tests -v   # 8 tests, ~6 s
PYTHONPATH=src:../forgetting-law/src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Linear regression, Haar-random task subspaces, exact convergence, Gaussian cluster centres; MIT.
