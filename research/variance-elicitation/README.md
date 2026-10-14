# Eliciting the variance of benign drift

Stdlib-only Python. One observation cannot elicit a variance, but two independent re-executions can, through `D = (y1−y2)²/2`. Exact misreport costs (Brier `(r−σ²)²`, scale-free `1/λ+ln λ−1`), a closed-form detection sample size `≈ 2z²(κ+1)/(λ−1)²`, the disjoint-pairs penalty against the sample variance, and the heavy-tail breakdown. See `paper/whitepaper.md`.

```bash
cd research/variance-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Results: `Var(D)=σ⁴(κ+1)/2` on four distributions; exact excess losses matched to 1%; simulated 95% detection at the CLT task count (0.93–0.97, Gaussian and Laplace); pairs are 1.80× worse than the sample variance at n=10 (formula 1.800); with Pareto tail index 3 the error decays like `m^{−1/3}`, not `m^{−1/2}`. Stylised, independent observations; MIT.
