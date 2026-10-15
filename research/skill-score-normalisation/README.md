# Skill-score normalisation

Stdlib-only Python. Brier skill scores that divide by the realised base rate `ȳ(1−ȳ)` are improper: the exact optimal report is `r* = a/(a+b)` (inverse-baseline-variance-weighted hit rate), equals ½ for any belief at two tasks, and is biased by `≈ −(1−2p)/n` (0.232 vs p=0.1 at n=5); misreporting gains 0.042 BSS for a 0.017 true-Brier cost, and reports on one task type leak through the pooled baseline. A leave-one-out (or ex-ante) baseline restores properness. See `paper/whitepaper.md`.

```bash
cd research/skill-score-normalisation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Independent tasks, constant reports, exact enumeration checked by Monte Carlo; MIT.
