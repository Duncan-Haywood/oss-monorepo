# Replication, stake and blind collusion

Stdlib-only Python. Random `k`-fold replication of a decentralised job with a slashing dispute, against a colluding fraction `β` of workers. See `paper/whitepaper.md`.

```bash
cd research/replicated-execution
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: with secret assignment cheating is a coordination game; honesty is the unique equilibrium iff `S ≥ Gβ^{k−1}/(1−β^{k−1})` (geometric in `k`), below it a cheating basin of measure `1−π*` remains; with public assignment the corruption rate is `β^k` at any stake, and a leak probability `λ` leaves a floor `λβ^k`, so each order of magnitude of leakage costs about two replicas. Formulas match Monte Carlo (payoff within 0.007, corruption rates within sampling error). Stylised; MIT.
