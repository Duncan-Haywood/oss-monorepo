# Holdout precision in noisy training contests

Stdlib-only Python. `n` contestants choose effort, are ranked on a noisy holdout (`σ = s/√m`), winner takes `V`. See `paper/whitepaper.md`.

```bash
cd research/contest-precision
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~20 s
PYTHONPATH=src python3 experiments/run.py                  # ~2 min; output in experiments/results.txt
```
Results: effort `e* = V a_n √m / s` with `a_2 = a_3 = 1/(2√π)` exactly; a pure symmetric equilibrium exists only below a precision ceiling `V/σ² ≤ λ_max(n)` (12.35, 7.78, 6.11, 5.60, 5.80 for n = 2, 3, 5, 10, 20), which is below the zero-rent limit and falls to half of it at n = 20; the optimal holdout size is `min(m_cap, (wVa_n/(2sκ))²)`, and when evaluation is cheap the ceiling, not cost, binds. Stylised (Gaussian independent noise, quadratic cost); MIT.
