# Interval scores

Stdlib-only Python. Paying verifiers for a central (1−α) drift interval with the Winkler interval score `(u−l)+(2/α)(l−y)₊+(2/α)(y−u)₊`: strictly proper for the α/2 and 1−α/2 quantiles, regret splits into two one-sided cdf integrals with a closed form (normal and Cauchy), the optimal expected score is exactly `4sφ(z)/α`, scale misreports cost a level-dependent asymmetric amount, and under Cauchy drift the scores have no mean but paired score differences are bounded, so detection still works. See `paper/whitepaper.md`.

```bash
cd research/interval-scores
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Risk-neutral verifiers, known location family, one interval per task; MIT.
