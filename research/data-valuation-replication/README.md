# Replication attacks on data-valuation payments

Stdlib-only Python. When contributors of data or gradients are paid by Shapley or leave-one-out value, what does submitting copies earn? See `paper/whitepaper.md`.

```bash
cd research/data-valuation-replication
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests
PYTHONPATH=src python3 experiments/run.py                  # instant; output in experiments/results.txt
```
Results (exact, no sampling; checked against permutation brute force and the integral identity): Shapley pays a replicator more for every extra copy even when copies add zero information, saturating at the contributor's stand-alone value (5.5× the honest payment against 9 others, `(n+2)/2` in general for unit precisions); if the evaluator treats copies as independent the replicator's pot share tends to 100% (96% at 200 copies); leave-one-out pays true copies exactly 0 (each is redundant) but distributes only 10% of the pot to a lone honest contributor; the cost per copy at which replication stops paying is the marginal value of the first extra copy (0.054 of a 0.909 pot); collapsing suspected duplicates fixes it but underpays genuinely independent lookalikes by 45%. Stylised; MIT.
