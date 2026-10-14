# Sleeping ledger: a self-financed wealth market for specialist modules

Stdlib-only Python. Modular, continually learning systems keep specialists that matter only in some regimes. In a wealth market where only awake modules report and each awake module's wealth is multiplied by `1+η(ℓ̂−ℓ_i)` (`ℓ̂` the price-weighted loss), total wealth is conserved exactly, sleeping wealth is frozen (each regime keeps a private ledger), regret against the market on a module's awake rounds is at most `ln(1/π_i)/η + η·n_i` with `n_i` its own awake time (the exponential variant pays `ηT/8` and is not budget balanced), and admitting a module with wealth `ε` costs each incumbent `ln(1/(1−ε))/η` and the entrant `ln(1/ε)/η`. In a recurring-regime run the ledger matches the per-round oracle (0.1004 vs 0.1000, regret ≈2.7 whatever K) while forced-to-report Hedge sits at the generalist (0.30) and fixed share is worse (0.34–0.36). The bound is loose (measured regret 2.7 vs bound ~10³). See `paper/whitepaper.md`.

```bash
cd research/sleeping-ledger
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Bounded losses, exogenous wake sets, proportional-dilution entry; single-seed simulations; MIT.
