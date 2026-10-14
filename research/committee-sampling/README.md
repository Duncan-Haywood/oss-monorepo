# Committee sampling

Stdlib-only Python. Drawing a verifier committee of `m` from a finite pool of `N` nodes with `B` Byzantine: majority capture is exactly hypergeometric, impossible once `m ≥ 2B+1`, and beats the with-replacement binomial by up to 26× (N=100, B=30, m=41: 1.4e-4 vs 3.6e-3). At 2⁻⁴⁰ the exact committee is a constant ≈0.90 of `ln(1/ε)/KL(½‖β)` (β from 0.1 to 0.45) and Hoeffding over-sizes it by up to 2.2×. Under stake-weighted draws only the Byzantine *stake* share matters: 20 of 100 nodes at 4× stake hold half the weight and capture a 41-member committee with probability ½. A threshold-`t` rule trades safety against liveness exactly. See `paper/whitepaper.md`.

```bash
cd research/committee-sampling
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Static adversary, votes are wrong/right, independent draws; MIT.
