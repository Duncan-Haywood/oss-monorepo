# Evaluation

- `reference.py` → `reference.json`: PySAL (esda 2.9.0, libpysal 4.14.1, numpy
  2.4.6, Python 3.11) on nine cases whose weights libpysal builds itself
  (queen contiguity from the bundled list, great-circle k nearest neighbours,
  `DistanceBand` binary and inverse distance with powers 1 and 2, libpysal's
  `KNN`), transforms R, B and O. `../reference.test.mjs` pins the engine to it:
  S0, S1, S2, Moran's I with both variances, z and p, Geary's C likewise,
  General G, every local I and quadrant, the conditional moments (EIc, VIc)
  and every Gi* z, to 1e-9. Run `python -I eval/reference.py > eval/reference.json`
  with esda and libpysal installed (`pip install esda libpysal`, a few seconds).
- `calibration.mjs` → `calibration-output.txt`: seeded null simulation (values
  independent of place, normal and lognormal, on the 48-state map and on 120
  random points), 1,000 maps each: false-positive rate of every global test
  at 0.05, analytic and permutation (two-sided and esda's one-sided), and how
  many local clusters a pattern-free map shows, with and without the
  false-discovery-rate cut-off. `node eval/calibration.mjs > eval/calibration-output.txt`
  (about 35 s).
- `build-example.py`: rebuilds `../data/*.csv` from libpysal's `us_income`
  example (`../data/SOURCE.md`).
