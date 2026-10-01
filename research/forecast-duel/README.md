# Forecast duel

Stdlib-only Python. Two verifiers report fixed probabilities on the same binary tasks and the network wants to know, at any time and with a guaranteed error rate, whether A is better than B under Brier loss. Betting on the score difference gives an anytime-valid e-process whose best fixed bet grows at exactly `KL(q‖π)`, where `π=(rA+rB)/2` is the break-even outcome frequency, so the expected decision time is `ln(1/α)/KL(q‖π)`. A peeking z-test on the same data falsely declares A better 19–38% of the time at a nominal 5%; a uniform mixture over bets holds the error at or below 3.8% and costs 15–41% extra delay. See `paper/whitepaper.md`.

```bash
cd research/forecast-duel
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # under a minute; output in experiments/results.txt
```
Fixed reports, i.i.d. outcomes, Brier loss; MIT.
