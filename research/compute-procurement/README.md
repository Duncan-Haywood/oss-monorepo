# What does it cost to buy decentralised compute?

Stdlib-only Python. Reverse auctions for buying k identical compute units from n devices with private costs: exact VCG payments, the Myerson reserve, and the first-price equilibrium. See `paper/whitepaper.md`.

```bash
cd research/compute-procurement
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests (~20 s)
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Results (costs U[0,1]): the truthful k-unit threshold auction pays exactly `k(k+1)/(n+1)` against true winner cost `k(k+1)/(2(n+1))`, a frugality ratio of exactly 2 for every n, k (also with a reserve); the optimal reserve is exactly `v/2` (twice-cost virtual value), worth up to +1.03 utility at low value and nothing once `v ≥ 2`; the pay-as-bid equilibrium is computed in closed form and matches VCG revenue (1.3334 vs 1.3333) with deviation gain ≈ 5·10⁻⁴. Stylised; MIT.
