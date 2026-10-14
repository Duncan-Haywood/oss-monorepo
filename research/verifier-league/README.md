# Verifier league

Stdlib-only Python. Which of n verifiers, with fixed probability reports on shared binary tasks, has the lowest Brier loss, decided at any time with a guaranteed error rate? Every pair has a betting e-process growing at `KL(q‖(rᵢ+rⱼ)/2)`; certifying the best means beating every rival, so the delay is set by the rival whose midpoint with the leader is nearest `q` — the best rival on the *opposite side* of the truth, not the runner-up (rate 0.0026 vs 0.0086 in a six-verifier league). The mixture certifies within 1.35–1.60× the oracle prediction; successive elimination is 4–5× cheaper in verifier evaluations at n=8–12; peeking z-tests declare a false "strict best" in 59% of tie runs versus 1.6% for the e-process. See `paper/whitepaper.md`.

```bash
cd research/verifier-league
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~10 s
PYTHONPATH=src python3 experiments/run.py                  # ~15 min; output in experiments/results.txt
```
Fixed reports, i.i.d. outcomes, Brier loss; MIT.
