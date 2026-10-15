# Forgetting law

Stdlib-only Python. Continual learning as sequential projection: train a shared model to convergence on each of a stream of random rank-`r` tasks in `R^d` that share a solution. The expected loss on a just-learned task after `k` more tasks is exactly `(r/d)(1−r/d)(ρᵏ − λᵏ)` with `ρ = 1−r/d` and `λ = ρ − r(d−r)/((d+2)(d−1))` — zero at `k=0`, rising to a peak (`0.044` at `d=12, r=3`, lag 2.5), then decaying to zero because the tasks agree. The cumulative forgetting has the closed form `(r/d)ρ(d/r − 1/(1−λ))`; splitting the model into `m` uniformly routed modules dilutes both rates by `m` and cuts short-horizon forgetting, but in the realizable case one shared model always minimises seen-plus-fresh loss; with conflicting tasks forgetting settles at a floor `2rτ²/d`, which per-task modules remove at a parameter cost. See `paper/whitepaper.md`.

```bash
cd research/forgetting-law
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~10 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Linear regression with Haar-random task subspaces, exact-convergence training; MIT.
