# Anytime liquidity for cost-function markets

Stdlib-only Python. LMSR with time-varying liquidity `b_t` is Hedge with rate `1/b_t`; this asks what not knowing the horizon costs. See `paper/whitepaper.md`.

```bash
cd research/anytime-liquidity
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: `b_t = c*√t` with `c* = 1/(2√ln N)` costs exactly `√2` over the horizon-aware bound (1.36→1.41 measured); doubling is 1.70× worse than the continuous schedule against a reactive adversary; self-tuning liquidity `b_t = Δ_{t−1}/ln N` makes the subsidy track the data (1.3 vs 102 on easy data) with regret ≤ `2Δ`. Regret analysis only, not a full trader model; MIT.
