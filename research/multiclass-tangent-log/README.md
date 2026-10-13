# Multiclass tangent-log

Stdlib-only Python. Follow-up to `categorical-scores` and `tangent-log`: a bounded, strictly proper multiclass log score built by extending `x ln x` below a cutoff ε with its second-order Taylor polynomial. Identical to `−ln r_y` when every `r_j ≥ ε`; payment range exactly `1−ln ε` for any K; 63× Brier's rare-class incentive per range at ρ=10⁻³ (best cutoff ε=p_min); zeroing out a rare class costs a closed-form bounded amount (0.005 at ρ=ε=0.01 vs 1.3·10⁻⁴ for Brier, ∞ for log). See `paper/whitepaper.md`.

```bash
cd research/multiclass-tangent-log
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~4 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Risk-neutral verifiers, one report per task; MIT.
