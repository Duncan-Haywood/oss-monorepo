# Freivalds in floating point

Stdlib-only Python. Probabilistic verification of a matrix product `C = AB` (one layer of a training or inference step) by checking `‖A(Br) − Cr‖ ≤ t` for a random probe `r`. In floating point the check needs a tolerance `t`, which turns Freivalds' 1/2 error bound into a *size-dependent* miss probability: a rank-one corruption of Frobenius norm `F` is missed by a Gaussian probe with probability exactly `erf(t/(√2F))`, rank one is the worst case for a given `F`, `m` probes give `erf(·)^m`, and Rademacher probes are stuck at 1/2 for any size. Measured float32 noise sets `t`; a probe derived from the result by hash needs `1/erf(·)` grinding tries. See `paper/whitepaper.md`.

```bash
cd research/freivalds-float
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Single product, additive corruption, sequential float32 accumulation as the noise model; MIT.
