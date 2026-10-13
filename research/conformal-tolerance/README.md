# Conformal tolerance

Stdlib-only Python. How to set a slashing tolerance for drift-based verification from a finite set of honest calibration runs, with no distributional assumption. The split-conformal threshold has an exact, distribution-free false-slash law (`(n+1-k)/(n+1)` on average, but only ~50% of calibration sets actually deliver ≤ α); a PAC-safe threshold needs `n ≥ ln δ / ln(1-α)` runs (459 at α=δ=1%), and the finite-sample safety margin is hiding room for a cheater (×1.26 at n=2000, Pareto-3 drift). Gaussian plug-in tolerances over-slash skewed drift up to 17×; pooled calibration over mixed hardware over-slashes the noisy class and lets the quiet class hide 2.9× more. See `paper/whitepaper.md`.

```bash
cd research/conformal-tolerance
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Exchangeable honest scores, synthetic lognormal/Pareto drift plus emulated float32 residuals; MIT.
