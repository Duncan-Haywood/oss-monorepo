# Verifier bribery: collusion thresholds in refereed verification

Stdlib-only Python. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/verifier-bribery/

```bash
cd research/verifier-bribery
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py
```
Results: closed-form bribe floor `b*(x)=λS+h+(φJ−k)/((1−φ)x)`; a collusion-proof stake that falls as 1/m only
until it meets the stake at which checking pays at all (see Known gaps);
jackpots covering check cost lift the floor to ≥ λS+h at every cheat rate. Closed forms verified against brute force
and Monte Carlo. Stylised model; limitations in the paper. MIT.

## Known gaps

From the round 63 quality audit
([`2026-11-13-verifier-bribery.json`](../../portfolio/quality/audits/2026-11-13-verifier-bribery.json)); not yet fixed:

- **Result 1's stake `S_c` is not collusion-proof when checking does not pay even unbribed**, i.e. when
  `λS+h < (k−φJ)/(1−φ)`: verifiers stay silent for free and the solver cheats on every task. With the default
  parameters (s=1, λ=k=0.5, h=φ=J=0) and m=4, `collusion_threshold_stake` gives 0.5 but the solver's profit at
  S=0.6 (and 0.9) is still 1.0 = s, by both `solver_profit_closed_form` and `solver_profit_bruteforce`. The
  threshold is `max(S_c, ((k−φJ)/(1−φ) − h)/λ)` (here 1.0), so "falls as 1/m" holds only for m below
  `s/((k−φJ)/(1−φ))`. The paper's Result 1 and its tables need restating.
- The solver's profit `x(s − m b)` omits the `(1−φ)` share of tasks that are real cheats, which the verifier's
  payoffs include, so profits with planted faults are overstated (`model.py`, `_profit`).
- The brute force reuses the same profit and payoff functions as the closed form, so it cannot catch a modelling
  error.
- Nearest prior work is not cited: Truebit's forced errors and jackpots, Dong et al. (CCS 2017) on collusion in
  outsourced computation, and Mamageishvili and Felten (2023) on optimistic-rollup incentives.
