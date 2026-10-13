# Tangent log

Stdlib-only Python. Log score gives verifiers strong incentives on rare faults but its payment is unbounded, so stakes and slashing cannot cover it. Extending the log generator past `[ε,1−ε]` by its second-order Taylor polynomial gives a strictly proper score that equals log up to a constant on `[ε,1−ε]`, with worst-case payment exactly `R_ε = ln((1−ε)/ε) + 1/(1−ε)`. Per unit of payment range it has 63× Brier's curvature at a rare-fault truth `p=10⁻³`, is worse than Brier for `p` above a closed-form crossover (≈0.07 at ε=10⁻³), and `ε=p` is the best cutoff for a truth `p`. See `paper/whitepaper.md`.

```bash
cd research/tangent-log
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Binary outcomes, one report per task; MIT.
