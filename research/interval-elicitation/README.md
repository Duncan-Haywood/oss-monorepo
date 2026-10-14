# Interval elicitation

Stdlib-only Python. Eliciting a drift tolerance interval `[l,u]`: the Winkler interval score is proper for the equal-tailed quantile pair with exact regret `(2/α)[PR(l,α/2)+PR(u,1−α/2)]` (finite even for Cauchy drift) but has unbounded payment; the bounded width-plus-miss loss `(u−l)+λ·1[miss]` elicits the shortest (level-set) interval, 22–31% narrower on lognormal drift, at a 3–48× larger detection sample for α≥0.1. See `paper/whitepaper.md`.

```bash
cd research/interval-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <2 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Risk-neutral verifiers, unimodal drift, one report per task; MIT.
