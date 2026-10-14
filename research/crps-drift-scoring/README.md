# CRPS vs log score for continuous drift reports

Stdlib-only Python. A verifier reports a Gaussian `N(m,s²)` for a continuous quantity (e.g. benign float drift); we compare the continuous ranked probability score (CRPS) with the log score. Exact closed forms for expected score and excess, the CRPS as an integral of threshold Brier scores, a bounded overconfidence penalty, 1-Lipschitz sensitivity to outcome noise, a plug-in law `5σ/(8√π n)`, and finite-variance thresholds (ν>2 vs ν>4). See `paper/whitepaper.md`.

```bash
cd research/crps-drift-scoring
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Results: overconfidence costs at most `σ(√2−1)/√π = 0.234σ` under CRPS but 4995 nats at `s=0.01σ` under log; mean error costs linearly (`≈|d|−2σ/√π` at s=σ) vs quadratically; plug-in fit excess `n·excess → 0.353σ` (CRPS) vs 1 (log), matched by Monte Carlo; under a `t₃` truth the log-score's sample std keeps growing (5→11 from N=10³→10⁵) while CRPS stays ≈1.1. Gaussian reports, scalar quantity; MIT.
