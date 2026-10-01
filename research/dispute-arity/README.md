# How wide should a dispute bisect?

Stdlib-only Python. Optimal arity and leaf size for k-ary bisection dispute games (Verde/Arbitrum-style refereed delegation) over a hash-chained training trace. See `paper/whitepaper.md`.

```bash
cd research/dispute-arity
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: per-round cost `a+b(k-1)` gives continuous optimum arity `k*` solving `k ln k − k + 1 = a/b`, binary optimal iff `a/b ≤ 2ln2−1 ≈ 0.386`; at T=10⁶ and a/b=10 arity 10 is 1.9× cheaper than binary and 6× at a/b=1000; an adaptive per-round schedule (DP) beats the best uniform arity by at most ~1%; stopping bisection early and re-executing a leaf of m steps saves 9–56% depending on step cost; latency weight acts as extra fixed round cost and widens arity. An executable hash-chain protocol localises all 1000 corrupt positions with exactly the predicted rounds and checkpoints. Stylised; MIT.
