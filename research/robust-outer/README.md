# Robust outer aggregation in local SGD

Pure Python, no dependencies. Companion to `noisy-local-sgd`: DiLoCo-style local SGD where the server aggregates worker displacements with a median or trimmed mean because some workers are Byzantine. Any translation-equivariant aggregator makes the outer loop exactly linear, so the floor is `α V_w Var(b)/(s(2−αs))` plus a bias term `V_w E[b]²/s²` and the stability limit is unchanged; the median costs `π/2` in variance with no attackers (exact finite-`N` values by quadrature), its worst-case bias is bounded (`Φ(z)=1/(2(1−ε))`) and beats the mean once the attack offset exceeds about 1.4 honest-noise sigmas, more workers do not remove that bias (only `ε` and a longer inner loop `H` do), and trimming exactly `f` is worse than the median. Matched to simulation within 1.3%. See `paper/whitepaper.md`.

```bash
cd research/robust-outer
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~7 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt (~5 min)
```
Quadratics, Gaussian noise, one-sided constant-offset attackers; MIT.
