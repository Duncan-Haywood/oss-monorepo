# Evaluation files

- `simulate.py`: draws `data/wages-simulated.csv` (numpy, seed 20261118).
- `reference.py`: runs statsmodels 0.15 and scipy 1.18 (as external programs)
  on two specifications of the example (the full one with a text `region`
  column and three exclusion restrictions, and a smaller one) and writes
  `reference.json`, which `reference.test.mjs` checks the engine against:
  statsmodels `Probit` and `OLS` (nonrobust, HC1, cluster); the two-step
  estimator from those with the Heckman-Greene covariance written in numpy;
  and maximum likelihood from a log-likelihood written with scipy's
  `norm.logcdf`, maximised by scipy (BFGS, then Nelder-Mead, then Newton
  steps on statsmodels' numerical derivatives), with conventional, robust and
  clustered covariances from statsmodels' `approx_hess3` and `approx_fprime`.
  The engine's analytic gradient is not used there. About 12 seconds.
- `coverage.mjs`: Monte Carlo coverage of the 95% intervals on the example's
  design (redrawn in JavaScript), in three scenarios: as the example (rho
  0.6), rho 0, and no exclusion restriction. `node eval/coverage.mjs 1000 11`
  wrote `coverage-output.txt` (about 6 minutes).
- `peak-check.mjs`: in 60 draws of the no-exclusion scenario, whether the
  engine's maximum-likelihood optimum is ever below the log-likelihood at the
  true parameters (it was not: `peak-check-output.txt`).

Regenerate: `python3 -m venv v && v/bin/pip install numpy pandas scipy statsmodels`,
then `v/bin/python eval/simulate.py && v/bin/python eval/reference.py`.
Versions used are recorded in `reference.json`.
