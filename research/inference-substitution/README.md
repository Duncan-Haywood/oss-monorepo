# Model substitution in decentralised inference

Stdlib-only Python. A provider serves a cheaper model on a fraction `p` of queries; a verifier re-scores a fraction `f` and runs an anytime-valid mixture e-process. See `paper/whitepaper.md`.

```bash
cd research/inference-substitution
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests
PYTHONPATH=src python3 experiments/run.py                  # seeded, ~5 s; output in experiments/results.txt
```
Results (seeded Monte Carlo plus closed forms): detection delay goes as `2 ln(G/α)/(f p² χ²)` (measured 0.5–0.8× the formula), so the cheater's best response is to substitute rarely and undetected savings grow as `s√(2LN/(fχ²))`, not `N` (measured ×7.75 for ×64 queries; formula ~1.6× high); audit rate to cap savings at `B` is `2LNs²/(χ²B²)`, unachievable by sampling for near-identical substitutes (`β=0.9` needs `f=7.6`); cost-optimal rate `f*=(hK/(2Nc))^{2/3}` matches grid search. False alarms stay below `α`. Stylised i.i.d. token model; MIT.
