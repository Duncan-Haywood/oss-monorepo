# Holdout market: paying for model improvements without paying for overfitting

Stdlib-only Python. A market that pays contributors the decrease in hidden-holdout log loss. See `paper/whitepaper.md`.

```bash
cd research/holdout-market
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 4 tests
PYTHONPATH=src python3 experiments/run.py                  # ~35 s; output saved in experiments/results.txt
```
Results: payouts telescope to a known budget; naive (raw) payments let a data-less adversary hill-climb on the payment
feedback — 5000 queries earn 0.15 while the published model's true loss worsens by 0.37 — whereas a Ladder-style
rounded/thresholded rule pays ~0, at the price of leaving sub-η honest improvements unpaid and unpublished.
Stylised; limitations in the paper. MIT.
