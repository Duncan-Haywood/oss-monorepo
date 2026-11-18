# Evaluation files

- `simulate.py`: draws `data/job-training-simulated.csv` (numpy, seed 20261118).
- `reference.py`: runs statsmodels 0.15.0 `TreatmentEffect` (BSD-3, as an
  external program) on three covariate specifications and writes
  `reference.json`, which `reference.test.mjs` checks the engine against.
- `coverage.mjs`: Monte Carlo coverage of the 95% intervals on the example's
  design. `node eval/coverage.mjs 1000 2000 7` wrote `coverage-output.txt`
  (about 4 minutes).

Regenerate: `python3 -m venv v && v/bin/pip install numpy statsmodels`, then
`v/bin/python eval/simulate.py && v/bin/python eval/reference.py`.
