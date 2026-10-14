# Verification game: stakes, free-riding verifiers and drift tolerance

Stdlib-only Python on the economics of optimistic/refereed verification for decentralised ML training.
See `paper/whitepaper.md`.

```bash
cd research/verification-game
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py
```
Results: inspection-game equilibrium (`x*=k/(λS+h)`, `y*=s/(s+S)`); verifier free-riding saturates rather than
improving security; jackpot subsidy formula; optimal (tolerance, stake) under floating-point drift.
Stylised model; limitations in the paper. MIT.
