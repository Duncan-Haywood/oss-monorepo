# Decision markets for model routing

Stdlib-only Python. Per-arm conditional markets that route between K models when only the chosen arm's loss is observed. Inverse-propensity Brier payments are exactly proper even when the router reads the report (without the weight they are not); the payment price of exploration is exactly `E[1/π] = 1+(K−1)e^{ω²/2τ²}` (probit routers have infinite variance for `τ ≤ ω`); stake gaps distort the reported gap by a closed-form fixed point whose harm is second order. See `paper/whitepaper.md`.

```bash
cd research/decision-markets
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 16 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                  # ~5 s; output in experiments/results.txt
```
Results: exploration regret ≤ 0.2785τ; payment relative std `√(3E[1/π]−1)` (Monte Carlo under-reports the tail at τ ≤ 0.5); equal stakes cancel exactly, a stake gap ΔB costs `∝(ΔB/k)²`; uniqueness iff `B ≤ 12√3·kτ²`. Gaussian, one-shot, stylised; MIT.
