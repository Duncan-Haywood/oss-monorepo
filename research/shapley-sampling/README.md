# Shapley sampling

Stdlib-only Python. Contributors to a decentralised training run are paid their Shapley value, which nobody can enumerate, so the payer samples. In a saturating contribution game `v(S)=1−exp(−Σw_i)` the estimator variances are exact: permutation sampling is efficient (payments sum to `v(N)` in every run) but noisy; size-stratified sampling has 6–8× lower variance, is exactly zero-variance for equal contributors, but breaks efficiency (gaps up to 0.068 of a total of 1); reversing permutations (antithetic) cuts RMSE 1.6× for free; and the Hoeffding sample count is 4–5× more than needed. See `paper/whitepaper.md`.

```bash
cd research/shapley-sampling
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # under a minute; output in experiments/results.txt
```
Stylised submodular game, n ≤ 10 for exact enumeration; MIT.
