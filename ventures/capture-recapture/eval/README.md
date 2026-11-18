# Evaluation

- `reference.py` → `reference.json`: an independent reference (full multinomial
  over all 2^k histories, maximised by scipy.optimize). Run
  `python3 eval/reference.py > eval/reference.json` (about 100 s; needs numpy
  and scipy). `../reference.test.mjs` pins the engine to it.
- `coverage.mjs` → `coverage-output.txt`: 1,000 simulated studies under each of
  five models, coverage and bias of every estimator. `node eval/coverage.mjs`
  (about 3 s, seeded).
- `build-example.py`: rebuilds `../data/lily-pond-chorus-frogs.csv` from the
  USGS file (`../data/SOURCE.md`).
