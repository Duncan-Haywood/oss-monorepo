# Sparse outer synchronisation: unbiased vs error feedback

Pure Python, no dependencies. Companion to `noisy-local-sgd` and `partial-participation`: DiLoCo-style outer step where each worker sends only a fraction `p` of its pseudo-gradient. Unbiased rescaling has floor `α V (1/p) / (N s (2−αs(1+w/N)))`, `w = 1/p−1`, i.e. `1/p` times the uncompressed floor; error feedback (a per-worker memory) has an exact closed form from a 4-dimensional moment recursion, costs only `1+αs·w` at small steps for any `N`, and pays in speed instead: the mean dynamics have determinant `1−p`, so the fastest contraction is `√(1−p)`. Stability limits, matched-rate floors and horizon losses over a spectrum are tabulated; simulation matches within 1.5%. See `paper/whitepaper.md`.

```bash
cd research/sparse-outer-sync
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Diagonal quadratics, Gaussian noise, independent Bernoulli masks; MIT.
