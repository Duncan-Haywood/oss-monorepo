# Position rent

Stdlib-only Python. In a sequential LMSR verification market where Bayesian verifiers with conditionally independent signals trade once each, the trader in position `k` earns in expectation `b·I(y; s_k | s_<k)` — a conditional mutual information — so rents telescope to `b·I(y; s_1..n) ≤ b ln 2`, the market maker's *expected* loss (checked against an explicit cost-function simulation to 3 decimals). Rents fall strictly with position (a=0.7: 0.082, 0.069, … 0.003 at 30) with successive ratio approaching `e^{-C}` (Chernoff information) from below. Order redistributes a fixed total (best-first pays a 0.9-accurate verifier 0.368 of 0.407, worst-first 0.303). With per-trader cost `c` the market fills `n*(b,c)` seats (a=0.7, c=0.005: b=0.25→11 verifiers, 92% accurate; b=5→41, 99.6%), the expected subsidy is 71–98% of the `b ln 2` worst case (n=11 to 41), and error falls roughly as `1/b`. See `paper/whitepaper.md`.

```bash
cd research/position-rent
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Binary state, symmetric signals, one trade each, myopic-Bayesian traders (no strategic delay); MIT.
