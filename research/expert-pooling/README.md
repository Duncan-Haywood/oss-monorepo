# Pooling modular experts: how much should a router extremize?

Stdlib-only Python. Calibrated experts with shared training data (correlated errors) pooled as `sigmoid(a · mean logit)`.
See `paper/whitepaper.md`.

```bash
cd research/expert-pooling
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Results: Bayes-optimal exponent `a* = n/(1+(n−1)ρ)` (matches a numerical argmin of the exact loss to 4 digits); extra
experts saturate at `n_eff → 1/ρ`; naive independence pooling (`a=n`) is worse than chance at ρ=0.9; over-extremizing costs
more than under-extremizing; ρ is estimated from labelled logits (sd 0.006 at T=10⁴) and online gradient descent finds `a*`.
Stylised (equicorrelated Gaussian signals); MIT.
