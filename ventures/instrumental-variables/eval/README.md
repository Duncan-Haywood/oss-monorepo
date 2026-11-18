# Evaluation files

- `simulate.py`: draws `data/schooling-simulated.csv` (numpy, seed 20261118).
- `reference.py`: runs linearmodels 7.1 (`IV2SLS`, `IVLIML`, `IVGMM`; NCSA
  licence, as an external program) on three specifications of the example
  (overidentified, just identified, two endogenous regressors with a
  constructed `age` instrument) under unadjusted, robust and clustered errors,
  each with and without the small-sample factor, and writes `reference.json`,
  which `reference.test.mjs` checks the engine against. The Anderson-Rubin
  references are linearmodels OLS fits of y - b x at fixed b and set
  endpoints from scipy's `brentq`, independent of the engine's closed form
  and grid. About 3 minutes.
- `coverage.mjs`: Monte Carlo coverage of the clustered 95% intervals on the
  example's design (redrawn in JavaScript), at the example's strength, with
  weak instruments, and with weak instruments and strong endogeneity.
  `node eval/coverage.mjs 1000 11` wrote `coverage-output.txt` (about 6
  minutes).

Regenerate: `python3 -m venv v && v/bin/pip install numpy pandas scipy linearmodels`,
then `v/bin/python eval/simulate.py && v/bin/python eval/reference.py`.
Versions used: linearmodels 7.1, numpy and scipy as recorded in
`reference.json`.
