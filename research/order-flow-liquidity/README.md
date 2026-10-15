# Order flow sets the liquidity

Stdlib-only Python. A Glosten–Milgrom (GM) market maker for a binary verification claim, with informed share `μ` and accuracy `q`, has posterior log-odds moving by exactly `k = 2·atanh(μ(2q−1))` per net buy, so its price path is an LMSR with `b* = 1/k`. A wrong `b` costs log loss only in a transient whose peak is scale-free in `m` and worse when overconfident; the LMSR subsidy `→ b* ln 2` is exactly the spread the GM maker charges; confidence takes `logit/(k m)` trades. See `paper/whitepaper.md`.

```bash
cd research/order-flow-liquidity
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Unit trades, exogenous informed share, static `m`; MIT.
