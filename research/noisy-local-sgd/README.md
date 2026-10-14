# Noisy local SGD

Pure Python, no dependencies. Companion to `local-sgd-bias` and `outer-momentum` (both noise-free): DiLoCo-style local SGD with `M` workers, `H` inner steps and an outer heavy-ball step on a quadratic with gradient noise. Exact stationary loss `αV(1+β)/((1−β)s(2(1+β)−αs))` per mode (matches simulation to 0.2%), independent of `H` at `α=1`, momentum free at equal effective step, linear speedup in `M` until the step saturates, and a noise-limited sync interval that grows as the target floor falls. See `paper/whitepaper.md`.

```bash
cd research/noisy-local-sgd
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Quadratics, Gaussian noise, shared Hessian; MIT.
