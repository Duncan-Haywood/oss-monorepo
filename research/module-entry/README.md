# Module entry in routing markets

Stdlib-only Python. What share of a Hedge/LMSR router's mass should a newly added module get? The regret certificate to every expert is `c_i/η + ηT/8` with `c_i = ln(1/π_i) + Σ_{j>i} ln(1/(1−π_j))`, and for any share sequence `Σ e^{−c_i} = 1` (a Kraft identity), so uniform entry `π = 1/(n+1)` is the unique minimax rule (all `c_i = ln N`; constant-share rules reach 4.1–9.7 at `n₀=4, K=12`); against a champion prior `P` the optimal shares are `P_j/S_j` with expected coefficient `H(P)`; the price of entry is exactly `ln(1/π)/η` (better arrival) or `ln(1/(1−π))/η` (worse), independent of the quality gap, with catch-up time `ln((1−π)/π)/(ηΔ)`; a recency prior cuts expected regret 3.11→2.70 nats. See `paper/whitepaper.md`.

```bash
cd research/module-entry
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Known arrival rounds, fixed η, bounded undelayed losses; MIT.
