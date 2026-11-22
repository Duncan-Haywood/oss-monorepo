# Holdout market: paying for model improvements without paying for overfitting

Stdlib-only Python. A market that pays contributors the decrease in hidden-holdout log loss. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/holdout-market/

```bash
cd research/holdout-market
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 4 tests
PYTHONPATH=src python3 experiments/run.py                  # ~35 s; output saved in experiments/results.txt
python3 experiments/figure.py                           # redraws experiments/overpayment.svg from results.txt
```
Results: payouts telescope to a known budget; naive (raw) payments let a data-less adversary hill-climb on the payment
feedback — 5000 queries earn 0.15 while the published model's true loss worsens by 0.37 — whereas a Ladder-style
rounded/thresholded rule pays ~0, at the price of leaving sub-η honest improvements unpaid and unpublished.
Stylised; limitations in the paper. MIT.

**Known gaps** (quality round 98, [`audit`](../../portfolio/quality/audits/2026-11-22-holdout-market.json)): the ladder
is tested only against random search, not Blum and Hardt's boosting attack; results are 8-seed means with no spread
(raw overpayment sd 0.27 at k=5000); one holdout size, so the η ∝ n^(-1/3) advice is untested; prior holdout-market
work (Harris and Waggoner 2019) not yet engaged; the ladder rounds the starting loss up (ln 2 → 0.70).
