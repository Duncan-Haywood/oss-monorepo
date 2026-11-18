# Verification scripts

- `reference.py` → `reference.json`: an independent Python reference (statsmodels
  0.15.0 OLS ANOVA, numpy 2.5.3 solving the expected mean squares, scipy 1.18.1
  quantiles) on eight generated studies; `../reference.test.mjs` compares.
  Regenerate with `python3 eval/reference.py > eval/reference.json`.
- `coverage.mjs` → `coverage-output.txt`: simulated coverage of the 95% MLS
  intervals, 2,000 studies for each of seven designs (about 8 s).
- `benchmark-study.mjs`, `simulate-nested.mjs`: the two example data sets
  (`../data/SOURCE.md`).
