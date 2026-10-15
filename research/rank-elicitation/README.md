# Rank elicitation

Stdlib-only Python. Paying verifiers for the *ranking* of K outcome classes with a linear rank-weight score `1−w[σ(y)]`: strictly proper for any strictly decreasing weights, adjacent-swap regret exactly `(p_i−p_j)(w_r−w_{r+1})` (linear in the gap, so it beats a Brier-derived ranking per unit payment range whenever the gap is below `1/(K−1)`), equal spacing maximises the minimum swap incentive at `1/(K−1)`, the worst report is the reversed ranking, and a top-k set costs the same as the mode. See `paper/whitepaper.md`.

```bash
cd research/rank-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Risk-neutral verifiers, one report per task; MIT.
