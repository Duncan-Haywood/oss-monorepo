# Heterogeneous inner steps in local SGD

Pure Python, no dependencies. Companion to `noisy-local-sgd` and `local-sgd-bias`: DiLoCo-style local SGD where fast devices run more inner steps `H_i` than slow ones in the same window and the server takes a weighted average of displacements. With `r = αΣw_i s_i`, the exact floor is `α²Σw_i²V_i/(r(2−r))`; one worker's information is `s²/V = I_∞ tanh(λH/2)` (saturating, and information per step falls with `H`); the optimal weights `w_i ∝ s_i/V_i = 1/(c(1+q^{H_i}))` span at most 2×, so **equal weights lose at most 9/8** (measured ≤ 1.09) while **step-proportional (FedAvg-style) weights lose up to 1.76× per mode and 10.5× on three modes** for one fast worker in eight. Matched to simulation within 1%. See `paper/whitepaper.md`.

```bash
cd research/heterogeneous-steps
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Quadratics with a shared optimum (no client drift), Gaussian noise, independent workers; MIT.
