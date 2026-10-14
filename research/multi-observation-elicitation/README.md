# Multi-observation elicitation of drift scale

Stdlib-only Python. Pair scores for variance from two independent draws (Casalaina-Martin, Frongillo, Morgan, Waggoner), applied to the audit cost of pricing benign floating-point drift in verifiable training. See `paper/whitepaper.md`.

```bash
cd research/multi-observation-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results (exact enumeration in rational arithmetic plus seeded Monte Carlo): the pair score `(r−(y₁−y₂)²/2)²` has excess loss exactly `(r−σ²)²` and kernels for `mean²`, the third central moment and `σ⁴` need 2, 3, 4 draws; payment noise `(μ₄+σ⁴)/2` makes detecting a variance under-report take `((z_α+z_β)/ρ)²(κ+1)/2` pairs (Monte Carlo power 0.70–0.79 vs nominal 0.8); scoring `|y₁−y₂|` beats the variance score for Laplace (0.882 vs 0.935 relative sd) and t₅; all-pairs pooling cuts payment variance by `(κ+1)/(κ−1)` (1.87 measured at Gaussian, `M=20`); correlated draws make the score elicit `σ²(1−ρ)`. Stylised distributions, no measured drift; MIT.
