# Verifier bribery: collusion thresholds in refereed verification

Stdlib-only Python. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/verifier-bribery/

```bash
cd research/verifier-bribery
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests
PYTHONPATH=src python3 experiments/run.py
```
Results: closed-form bribe floor `b*(x)=λS+h+(φJ−k)/((1−φ)x)`; a collusion-proof stake that falls as 1/m only
until it meets the stake at which checking pays at all (`collusion_threshold_stake` returns the larger of the two);
jackpots covering check cost lift the floor to ≥ λS+h at every cheat rate. Closed forms verified against brute force
and Monte Carlo. Stylised model; limitations in the paper. MIT.

## Known gaps

From the round 63 quality audit
([`2026-11-13-verifier-bribery.json`](../../portfolio/quality/audits/2026-11-13-verifier-bribery.json)); not yet fixed (the first one, Result 1's threshold
ignoring the stake at which checking pays at all, was fixed on 2026-11-17: the function, the paper and a test now
take the larger of the two):

- The solver's profit `x(s − m b)` omits the `(1−φ)` share of tasks that are real cheats, which the verifier's
  payoffs include, so profits with planted faults are overstated (`model.py`, `_profit`).
- The brute force reuses the same profit and payoff functions as the closed form, so it cannot catch a modelling
  error.
- Nearest prior work is not cited: Truebit's forced errors and jackpots, Dong et al. (CCS 2017) on collusion in
  outsourced computation, and Mamageishvili and Felten (2023) on optimistic-rollup incentives.
