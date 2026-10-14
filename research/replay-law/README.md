# Replay law

Python (uses the sibling `forgetting-law` package). Companion to `forgetting-law`: replaying an old task jointly with each fresh one is a projection onto the sum of two subspaces, so the expected loss on a tracked task under any replay schedule is an exact product of 2×2 matrices on the state `(loss on the task, error outside it)`. It recovers the no-replay law, matches simulation at every step, and gives closed-form totals for Bernoulli, periodic and one-shot replay. One replay is best at the forgetting-peak lag yet removes only 25–42% of total forgetting; a fixed period beats random replay only below ~1.2–3 peak lags; halving forgetting takes a replay rate from 0.25 (`d=12, r=3`) down to 0.015 (`d=128, r=1`). See `paper/whitepaper.md`.

```bash
cd research/replay-law
PYTHONPATH=src:../forgetting-law/src python3 -m unittest discover -s tests -v   # 8 tests, ~12 s
PYTHONPATH=src:../forgetting-law/src python3 experiments/run.py                  # ~3 min; output in experiments/results.txt
```
Linear regression with Haar-random task subspaces, exact-convergence training, one tracked task; MIT.
