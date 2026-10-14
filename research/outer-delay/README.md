# Outer delay

Pure Python, no dependencies. Companion to `outer-momentum`: overlapped DiLoCo-style training applies the outer update `τ` rounds late to hide a sync of cost `C`. On a quadratic the delayed plain outer step is stable iff `αs < 2 sin(π/(4τ+2))`, its best rate is `1 − 2 sin(π/(4τ+2))/κ_H` (exactly `κ_H/(κ_H+1)` at `τ=1`), momentum stops helping as soon as `τ ≥ 1`, and a fully hidden sync gains at most `(τ+1) sin(π/(4τ+2)) ≤ 1` over blocking averaging, so overlap loses to blocking (1.5–4.9× vs plain, 2.3–31× vs tuned momentum) unless the fresh pseudo-gradient carries weight above ½. See `paper/whitepaper.md`.

```bash
cd research/outer-delay
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 13 tests, ~4 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```
Noise-free quadratics, shared Hessian, one common delay; MIT.
