# Milestone schedules without enforcement

Stdlib-only Python. How many milestones does a job need when neither side can be forced to pay or deliver? Exact stage game plus closed-form schedule. See `paper/whitepaper.md`.

```bash
cd research/milestone-schedules
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests
PYTHONPATH=src python3 experiments/run.py                  # instant; output in experiments/results.txt
```
Results: a milestone is self-enforcing under some pre-payment split iff `c ≤ F_r + F_w` (pooled continuation; 3000/3000 stages vs a θ grid), so pay-after needs `P/W_r`, pay-before `C/W_w`, best split `C/(W_r+W_w)` equal milestones (110/25/20); front-loading gives a geometric schedule with `n* = ⌈ln(1+(V−C)/W)/ln(V/C)⌉` milestones (17 vs 100 at C=100, V=120, W=1; 2000/2000 random matches, nothing shorter in 10,000 draws), first milestone `1−(C−W)/V` of the job; cheap re-entry caps `W` and costs `ln(1/e)` milestones. Stylised: complete information, pro-rata value, exogenous relationship value; MIT.
