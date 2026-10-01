# Merge law

Stdlib-only Python. Merging `m` independently fine-tuned modules (task arithmetic / model averaging) when each module is trained to convergence on its own random rank-`r` task in `R^d` and all tasks share a solution. The merged error is `e = e0 − aΣPⱼe0`; only `E[P]=(r/d)I` is needed, so `E‖e‖² = 1 − 2amp + a²(mp+m(m−1)p²)` (`p=r/d`) holds exactly. The optimal scale is `a* = 1/(1+(m−1)p)` (plain averaging `1/m` and unscaled task arithmetic `a=1` are both far from it: at `d=32, r=4, m=8` residual 0.78 and 0.88 against 0.47), leaving `E‖e‖² = (1−p)/(1+(m−1)p)` — harmonic `1/m` decay, versus `(1−p)^m` for `m` sequential steps. Repeated merge rounds contract by that factor per round, so `m` parallel workers give a wall-clock speedup `ln f_m / ln(1−p)` that saturates logarithmically (`8.9×` at `m=16`, `17×` at `m=64`, `d/r=8`) and halves in efficiency at `m≈20`. Seen and fresh-task losses are closed-form and matched by simulation. See `paper/whitepaper.md`.

```bash
cd research/merge-law
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~5 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Linear regression with Haar-random task subspaces, exact-convergence training; MIT.
