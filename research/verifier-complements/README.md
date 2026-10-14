# Verifiers as informational complements

Stdlib-only Python. Exact value of a verifier committee for an accept/slash decision; when marginal-contribution hiring and leave-one-out pay break. See `paper/whitepaper.md`.

```bash
cd research/verifier-complements
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: decision value is zero below a closed-form minimum committee n₀ (4 verifiers at π=0.05, q=0.7) while mutual information is submodular; 24–34% of (S,i,j) triples violate diminishing returns; myopic greedy hiring buys nothing (ratio 0 to optimum); leave-one-out pay is zero below n₀, a parity sawtooth after, and 7× below average value at n=40. Stylised; MIT.
