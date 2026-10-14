# Audit allocation across heterogeneous jobs

Stdlib-only Python. A limited expected-audit budget `B` against a best-responding cheater on jobs with different gains `g_j` and harms `h_j`. See `paper/whitepaper.md`.

```bash
cd research/audit-allocation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: deterrence probability `t_j=g_j/(g_j+S)` makes the problem a knapsack (deter a set exactly, spend the rest on one job); density greedy plus partial-only candidate has a proved 1/3 guarantee and is within 1% of optimal on 91% of random instances; a uniform audit rate needs up to 1.9× the budget to deter everything and leaves 26% of harm at the full-deterrence budget; heterogeneity lowers full-deterrence cost (Jensen); stake needed for budget `B` solves `Σ g_j/(g_j+S)=B`. Stylised; MIT.
