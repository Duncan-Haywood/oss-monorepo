# Verifier cascades

Stdlib-only Python. Verifiers who see earlier verdicts herd: with accuracy `a` and a public tally `d` of revealed signals, `|d| ≥ 2` freezes the market, the wrong verdict wins with probability exactly `(1−a)²/(a²+(1−a)²)` (0.155 at a=0.7), and the cascade forms after `2/(a²+(1−a)²)` revealed signals on average (3.4). The herd's accuracy is capped at `a²/(a²+(1−a)²)` (0.845) however many verifiers join, while an independent majority of 101 is ≈1. A sealed first batch of `m ≥ 3` verifiers lifts the cap (0.875 at m=3, 0.949 at m=11) and beats a majority of the same paid size. The recursion is checked against Bayesian agents simulated with no walk assumption. See `paper/whitepaper.md`.

```bash
cd research/verifier-cascades
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Fair-coin state, i.i.d. symmetric signals, risk-neutral Bayesian verifiers paid for a correct verdict, tie broken by own signal; MIT.
