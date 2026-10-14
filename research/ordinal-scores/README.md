# Ordinal scores

Stdlib-only Python. Verifiers often report a distribution over *ordered* fault severities, where Brier ignores the order. The ranked probability score (RPS, Brier on the cumulative distribution) is strictly proper with exact regret `Σ_k (R_k−P_k)²`; moving mass `ε` a distance `d` costs exactly `dε²` (Brier `2ε²` for any `d`), pooling two adjacent classes costs half of Brier's, and per unit of payment range RPS never gives more incentive than Brier. See `paper/whitepaper.md`.

```bash
cd research/ordinal-scores
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Risk-neutral verifiers, one report per task; MIT.
