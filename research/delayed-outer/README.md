# Delayed outer updates in local SGD

Pure Python, no dependencies. Companion to `noisy-local-sgd` and `outer-momentum`: DiLoCo-style local SGD where the outer update is applied `τ` rounds late so communication overlaps computation. The delayed outer loop obeys `z^(τ+1) − z^τ + c = 0` with `c = αs`, so the stable outer step is exactly `c < 2 sin(π/(4τ+2)) ≈ π/(2τ+1)` (2, 1, 0.618, 0.445 for `τ = 0…3`), the fastest single-mode rate is the double root `τ/(τ+1)` at `c = τ^τ/(τ+1)^(τ+1)`, and the stationary noise floor is an exact Yule–Walker solve (closed form `(1+c)/((1−c)c(2+c))` at `τ=1`) that matches literal delayed-DiLoCo simulation to 0.3%. At small steps delay is free (floor +1% at `α=10⁻³`, `τ=4`); at a fixed floor the price of each delay round is a few percent of rounds, so at the tested target floor (the `τ=0` floor at `α=0.3`) the wall-clock-optimal delay is `⌈latency / compute time⌉` (1.9×–7.5× faster than no overlap at `L/T_c = 1…15`). That rule is an observation at one floor, not a theorem: at looser targets smaller delays win (target set by `α=2`, `L/T_c=7`: best `τ=2`, and `τ=7` is 3.2× slower; at `α=3` no overlap is best). The stability limit and the fastest-rate root are classical results for `x_{t+1} = x_t − c·x_{t−τ}` (Levin and May 1976; Kuruklis 1994) applied here to the DiLoCo outer loop. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/delayed-outer/

```bash
cd research/delayed-outer
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Quadratics, Gaussian noise, identical workers, constant delay, no momentum; MIT.
