# Layer tolerance

Stdlib-only Python. Per-layer versus total drift tolerances for a verified training step across `L` layers of iid Gaussian drift: giving each layer its own tolerance admits `L·c(L,α)σ` in total vs `z_α√L σ` for a total test (6.6× at `L=16`), the sum test's power ignores how a cheat is spread while the (Šidák) max test's does (best prover split is even, by concavity of `log Φ`), max catches a one-layer 2.7σ shift but lets 16σ through when spread, and a union test at `α/2` each caps the hidden budget at the sum test's. See `paper/whitepaper.md`.

```bash
cd research/layer-tolerance
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~3 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Gaussian independent layers, known σ, additive shifts; MIT.
