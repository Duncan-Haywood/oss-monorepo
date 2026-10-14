# Stake and audits are complements: sampled audits of committed training traces

Stdlib-only Python. A solver may corrupt any subset of T committed steps; the verifier audits k steps; slashing is
`min(F, f·hits)`. Result: payoff is convex in the number of corrupted steps (all-or-nothing), and deterrence holds iff
`min(F, f·k) ≥ T·g` — stake `F ≥ T·g` and audits `k ≥ T·g/f` are complements, so there is no capital/compute
trade-off; stake must scale with job length (or be windowed). See `paper/whitepaper.md`.

```bash
cd research/spot-check-slashing
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py
```
Stylised; hybrid convexity is empirical. MIT.
