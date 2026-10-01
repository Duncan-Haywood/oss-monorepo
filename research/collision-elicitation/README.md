# Collision elicitation

Stdlib-only Python. Eliciting the chance two honest runs of a nondeterministic operation agree, Γ = Σpᵢ², from pairs of runs: the squared-error score against the agreement indicator is proper with exact regret (r−Γ)², and one run provably cannot elicit Γ (non-convex level sets). The all-pairs U-statistic has exact variance `[4(n−2)ζ₁+2ζ₂]/(n(n−1))`, about a quarter of the disjoint-pairs variance at n=100. A fleet of H equal hardware classes has Γ=1/H, so strict equality over k replicas false-slashes honest workers with probability `1−H^{1−k}`. Colluders returning a common wrong value leave agreement unchanged at ε=2Γ/(1+Γ). A float32 reduction-order simulation checks the estimator. See `paper/whitepaper.md`.

```bash
cd research/collision-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # ~10 s; output in experiments/results.txt
```
i.i.d.-run theory plus simulated float32 summation orders; MIT.
