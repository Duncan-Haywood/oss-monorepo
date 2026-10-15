# Racing with unequal workers

Stdlib-only Python. Extends `speed-race` (pay the first `k` of `n` finishers, workers buy exponential speed) to workers with different costs. Proves the `speed-race` telescoping identity `π'(1)=(1−k/n)(H_n−H_{n−k})`; solves type-symmetric equilibria by an elasticity fixed point; derives an exact exit rule (slow workers idle iff `c_s/c_f ≥ n_f/(n_f−k)`, never for `k ≥ n_f`) checked by entry payoffs; shows cost ratio 4 shuts slow workers out for `k ≤ 3` of 4 fast and re-admits them as `k` grows; extends the symmetric formula to convex cost `c x^p` (winner-take-all still fastest; with `p=2` headcount does buy speed). An approximate mean-cost round-time law is reported as empirical. See `paper/whitepaper.md`.

```bash
cd research/race-heterogeneity
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 13 tests, ~5 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Two cost types, type-symmetric play, exponential finishing times, one-shot race, risk neutral; MIT.
