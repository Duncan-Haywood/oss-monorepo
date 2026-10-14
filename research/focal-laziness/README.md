# Focal laziness in peer prediction

Stdlib-only Python. Multi-task agreement pay (Dasgupta–Ghosh style) equals `2G·Cov` of two reports. When lazy verifiers share a per-task default (same public model), pay is `2G[a_i a_j pq + (1−a_i)(1−a_j) d(1−d)]`: effort is a coordination game with threshold `a* = (k/2G + s)/(pq + s)`, the all-lazy equilibrium always exists and pays `2G·d(1−d)` (as much as honesty when `d=p`), and only a gold-check payment mass `(2Gs+k)/(1−acc_D)` makes effort dominant. See `paper/whitepaper.md`.

```bash
cd research/focal-laziness
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: payment formula matches simulation to 0.004; d=0.5, p=0.3 lazy pays 1.19× honest; basin boundary a*=0.652 (dynamics from 0.632 collapse, from 0.672 converge). Binary, stylised; MIT.
