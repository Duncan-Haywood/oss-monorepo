# Verifier bribery: collusion thresholds in refereed verification

Stdlib-only Python. See `paper/whitepaper.md`.

```bash
cd research/verifier-bribery
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py
```
Results: closed-form bribe floor `b*(x)=λS+h+(φJ−k)/((1−φ)x)`; a sharp collusion-proof stake (falls as 1/m);
jackpots covering check cost lift the floor to ≥ λS+h at every cheat rate. Closed forms verified against brute force
and Monte Carlo. Stylised model; limitations in the paper. MIT.
