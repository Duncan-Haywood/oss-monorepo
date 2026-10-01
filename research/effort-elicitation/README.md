# Effort elicitation: what does it cost to pay a verifier to check?

Stdlib-only Python. Exact beta-binomial value-of-information V(n) for Brier/log/spherical scoring rules; implementable efforts, information rent, payout spread. See `paper/whitepaper.md`.

```bash
cd research/effort-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Results: implementable efforts are the concave envelope of V; Brier information rent/cost = (n−1)/(a+b) exactly; log needs half Brier's payout spread on rare-fault priors and degrades most gracefully under prior misspecification. Stylised; MIT.
