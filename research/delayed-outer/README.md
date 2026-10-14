# Delayed outer updates in local SGD

Pure Python, no dependencies. Companion to `noisy-local-sgd` and `outer-momentum`: DiLoCo-style local SGD where the outer update is applied `τ` rounds late so communication overlaps computation. The delayed outer loop obeys `z^(τ+1) − z^τ + c = 0` with `c = αs`, so the stable outer step is exactly `c < 2 sin(π/(4τ+2)) ≈ π/(2τ+1)` (2, 1, 0.618, 0.445 for `τ = 0…3`), the fastest single-mode rate is the double root `τ/(τ+1)` at `c = τ^τ/(τ+1)^(τ+1)`, and the stationary noise floor is an exact Yule–Walker solve (closed form `(1+c)/((1−c)c(2+c))` at `τ=1`) that matches literal delayed-DiLoCo simulation to 0.3%. At small steps delay is free (floor +1% at `α=10⁻³`, `τ=4`); at a fixed floor the price of each delay round is a few percent of rounds, so the wall-clock-optimal delay is exactly `⌈latency / compute time⌉` (1.9×–7.5× faster than no overlap at `L/T_c = 1…15`). See `paper/whitepaper.md`.

```bash
cd research/delayed-outer
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Quadratics, Gaussian noise, identical workers, constant delay, no momentum; MIT.
