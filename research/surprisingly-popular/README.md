# Surprisingly popular

Stdlib-only Python. When a fault is spotted by fewer than half the verifiers, majority vote is wrong however many vote (detection 0.45, false alarm 0.05: majority errs on faulty jobs 0.84 at n=101, 0.96 at n=301). The surprisingly-popular rule (verdict + predicted verdict fraction) reduces for truthful Bayesian verifiers to an exact fraction threshold `θ=v/(1−u+v)` (0.25 here), with exact finite-n error 2.1×10⁻⁵ on faulty jobs at n=101 and 47 votes for 10⁻³ error vs 36 for the Bayes rule. A wrong believed prior ruins finite-n accuracy (0.51 error at believed prior 0.99), a wrong believed detector quality breaks the limit, and Byzantines who vote clean and predict "everyone flags" break it at `ρ*=13.6%` (a trimmed mean prediction removes this in simulation). See `paper/whitepaper.md`.

```bash
cd research/surprisingly-popular
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Binary signal, common model, truthful reports assumed; MIT.
