# Precision scores: scoring vector reports

Stdlib-only Python. A verifier reports a vector (expected drift of an update, one coordinate per layer). Quadratic Bregman scores `−(y−r)ᵀA(y−r)` are proper and charge a misreport exactly `DᵀAD`. Against a trusted reference the per-task score gap has exact mean `DᵀAD` and variance `4DᵀAΣAD` for any noise law with covariance `Σ`; by Cauchy–Schwarz the precision score `A=Σ⁻¹` has the highest signal to noise for every deviation at once, needing `n = 4z²/(DᵀΣ⁻¹D)` tasks. An isotropic score has efficiency ≥ `4κ/(1+κ)²` (Kantorovich), attained by a split deviation: 25× more tasks at condition number 100 (power 0.29 vs 0.80 at 48 tasks), and a diagonal-only fix barely helps. Estimated precision from `m` reference draws reaches efficiency 0.61 at `m=2d`, 0.95 at `m=100`. See `paper/whitepaper.md`.

```bash
cd research/precision-scores
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Quadratic scores, trusted reference, finite covariance, independent covariance estimate; MIT.
