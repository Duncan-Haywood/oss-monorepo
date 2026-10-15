# Robust aggregation of verifier reports

Stdlib-only Python. What does a Byzantine fraction β do to mean, median and trimmed-mean aggregation of scalar reports? See `paper/whitepaper.md`.

```bash
cd research/robust-aggregation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: mean bias `βB` is unbounded; median bias is `σΦ⁻¹(1/(2(1−β)))` independent of B and diverging at β=½ (matched to simulation, e.g. 0.966 vs 0.967 at β=0.4); trimmed mean has closed form `(1−β)σ(φ(z_a)−φ(z_b))/(1−2τ)` for τ≥β and fails completely for τ<β; a deterministic rank bracket holds for any adversary. Stylised; MIT.
