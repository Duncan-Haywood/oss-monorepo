# Stopping scores

Stdlib-only Python. A verifier checks a binary claim with independent accuracy-`a` checks costing `c`, stops when it likes and is paid a proper score. Posterior log-odds walk on a lattice, so the optimal policy is a symmetric threshold `k` (verified against dynamic programming over all policies) with closed forms: delivered accuracy `1/(1+((1−a)/a)^k)`, expected checks `k(2p_k−1)/(2a−1)`. Participation needs `κ ≥ 4c/(2a−1)²` (Brier; log about half), Brier's `k* ≈ ln(κ(2a−1)²/((1−a)c))/λ` holds within one step, and adaptive stopping matches a fixed-sample verifier's accuracy with 2–3× fewer checks. See `paper/whitepaper.md`.

```bash
cd research/stopping-scores
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Binary state, prior ½, known accuracy, risk-neutral verifier; synthetic parameters; MIT.
