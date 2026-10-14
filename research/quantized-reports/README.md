# Quantized reports: how many bits does a probability report need?

Stdlib-only Python. Regret of reporting from a finite grid under Brier/log proper scoring rules. See `paper/whitepaper.md`.

```bash
cd research/quantized-reports
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py                  # ~4 s; output in experiments/results.txt
```
Results: optimal-grid regret = (1/24N²)(∫(πI)^{1/3})³ (matches to 0.3%); uniform grids lose a ln N factor under log score
(N^{-3/2} under a confident prior); raw minifloat grids are 13× worse than symmetrised ones. Stylised; MIT.
