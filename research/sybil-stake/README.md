# Sybil splitting and merging under stake-weighted pools

Stdlib-only Python. Does splitting stake across identities pay? See `paper/whitepaper.md`.

```bash
cd research/sybil-stake
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: a pool paying `w_i^α` shares is split-invariant iff `α = 1`; `α<1` rewards Sybils (per-head pool, n=20: attacker with 1/21 of stake takes 90% at identity cost 0.05, optimum `√(Rn/c)−n` matched exactly), `α>1` rewards
merging (whale drift); sharp per-identity deterrence fee `Rn/((n+1)(n+2))`; weighted-score wagering is split-neutral and truthful splitting is optimal (exact expectation). Stylised; MIT.
