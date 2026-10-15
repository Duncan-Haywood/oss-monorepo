# Market subspace descent

Stdlib-only Python. A cost-function market whose traders each understand only a bundle subspace is randomized subspace descent on the cost's Bregman divergence. The maker's expected loss telescopes to `½(e₀'Ae₀ − e_T'Ae_T)` whoever trades; the exact rate is the spectral radius of a second-moment operator (guarantee `1 − λ_min E[whitened projector]`). Securities with common correlation `c` slow single-security traders in closed form (d=5: 31 → 356 rounds to 10⁻³ as c goes 0 → 0.95), while A-conjugate bundles give exactly `1 − 1/d` at any correlation. With noisy beliefs the trader step κ acts as an SGD step: floor `dκσ²/(2−κ)`, and a per-security running-mean step beats the best constant step (0.26 vs 0.47 at T=100). A real 4-outcome LMSR run matches the local rate predictions within 0.01 for two of three bundle designs. See `paper/whitepaper.md`.

```bash
cd research/market-subspace-descent
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~10 s
PYTHONPATH=src python3 experiments/run.py                  # ~40 s; output in experiments/results.txt
```
Quadratic-cost theory plus one LMSR simulation; MIT.
