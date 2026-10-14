# Multi-verifier audit: reward splitting and the volunteer's dilemma

Stdlib-only Python. Extends [`verification-game`](../verification-game) and [`audit-dynamics`](../audit-dynamics)
from one verifier to m. See `paper/whitepaper.md`.

```bash
cd research/multi-verifier-audit
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests
PYTHONPATH=src python3 experiments/run.py                  # ~10 s
```
Results: aggregate detection is pinned at `s/(s+S)` for any m while equilibrium cheating *rises* with m under split rewards;
the symmetric equilibrium is a saddle for m ≥ 2 (volunteer's dilemma), Hedge concentrates audit burden on a subset while keeping
detection; bandit learners without an exploration floor are absorbed at "no cheating, no auditing". Stylised; limitations in the paper. MIT.
