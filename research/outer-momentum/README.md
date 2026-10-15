# Outer momentum

Pure Python, no dependencies. Companion to `local-sgd-bias`: DiLoCo-style rounds of `H` inner steps followed by an outer optimiser on the pseudo-gradient are exactly an outer optimiser on a quadratic with curvatures `1−(1−ηa)^H`, so inner steps precondition the outer problem (`κ_H ≈ κ/H`). Exact 2×2 per-mode rates (match literal simulation), heavy-ball tuning with every mode at `√β*`, the optimal momentum falling from 0.88 to 0.01 as `H` grows (a fixed 0.7/0.9 Nesterov is 4–8× slower in rounds), and the wallclock-optimal sync interval `H* ≈ C` (the sync cost in inner steps) with speedup `≈ √C/2`. See `paper/whitepaper.md`.

```bash
cd research/outer-momentum
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Noise-free quadratics, shared Hessian; MIT.
