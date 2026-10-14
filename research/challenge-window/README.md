# Challenge windows against censorship

Stdlib-only Python. Optimistic-verification challenge windows when block proposers can be bribed to censor the challenge; exact attacker value and window. See `paper/whitepaper.md`.

```bash
cd research/challenge-window
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: closed-form window matches the exact recursion (0/5000 mismatches) and Monte Carlo; luck-only analysis underestimates by 100–170×; with an exogenous bribe price stake does not shorten the window (63 blocks for S=10…1600); bounty-funded priority fees give `S·w ≈ G/((1−ρ)θ)`. Stylised single-attacker model; MIT.
