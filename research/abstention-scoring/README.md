# Abstention and scoring rules for verifiers

Stdlib-only Python. When reporting costs something, a truthful verifier under a proper scoring rule reports only when its score gain over an anchor exceeds the cost. This gives a closed-form abstention region, shows that silence is evidence, and quantifies what aggregators that ignore silence lose. See `paper/whitepaper.md`.

```bash
cd research/abstention-scoring
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: Brier gain gives abstention iff `|p − α| < √c` (log score: `KL(p‖α) < c`); silence is uninformative only when the anchor equals a symmetric prior; at prior 0.1 the reporters' outcome rate is 0.57 and ignoring silence costs 30× the log-loss of using it at n=12; a stale anchor turns silence into evidence for the wrong state. Gaussian-signal model, stylised; MIT.
