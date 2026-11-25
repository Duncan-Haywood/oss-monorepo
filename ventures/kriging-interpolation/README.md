# Kriging interpolation: semivariogram, variogram fit, kriged map and standard errors

**Live:** https://marisstella.app/kriging-interpolation/

You measured at some places (soil samples, wells, rain gauges, air sensors,
survey points) and need the values in between, with an honest idea of how
wrong they might be. This tool answers, on your CSV, in the browser:

- **What is the value between my sample points?** Ordinary kriging
  (Matheron 1963) on a grid, plus estimates with a 95% band at places you
  name.
- **How sure is it, and where would another sample help most?** The kriging
  standard error at every place, drawn as its own map.
- **How do my readings vary with distance?** The empirical semivariogram
  (Matheron 1963, or the robust Cressie & Hawkins 1980 form) with a
  spherical, exponential or Gaussian model fitted by Cressie's (1985)
  weighted least squares: nugget, sill and range in your units.
- **Is kriging worth it here, or would inverse distance do?** Every reading
  is left out in turn and predicted from the rest (Dubrule 1983, from one
  matrix inverse) by kriging, inverse distance weighting (Shepard 1968) and
  the nearest reading; the tool says which wins and whether its standard
  errors are honest (mean standardised squared error near 1).
- **Which readings disagree with their neighbours?** Those more than 3
  standard errors from their leave-one-out estimate are listed.
- **Longitude and latitude?** Distances in km on a sphere, measured
  straight through it (chordal), which keeps the models valid (Gneiting
  2013) and treats both sides of the 180° meridian as neighbours.

Nothing is uploaded. A statistical estimate from the readings you give, not
engineering, surveying or environmental advice.

## Methods

| Method | Paper | What it does |
| --- | --- | --- |
| Semivariogram | Matheron 1963; Cressie & Hawkins 1980 | Pairs binned by distance up to half the widest (15 classes by default): half the mean squared difference, or the robust fourth-power-of-root-difference form |
| Variogram fit | Cressie 1985 | Minimises sum N(h)(gamma_hat / gamma_model - 1)^2; nugget and partial sill by non-negative reweighted least squares for each range, range by a log scan and golden-section refinement |
| Ordinary kriging | Matheron 1963 (after Krige 1951) | Weights summing to one with the least expected squared error, every reading in every estimate; kriging variance |
| Leave-one-out | Dubrule 1983 | Every leave-one-out error and variance from one inverse; RMSE, MAE, mean error, mean standardised squared error |
| Baselines | Shepard 1968 | Inverse distance weighting, power 2, and the nearest reading, left out the same way |
| Sphere | Gneiting 2013 | Chordal distance on a 6,371 km sphere for lon/lat |

`PAPERS` in `engine.mjs` lists what was implemented from each paper and every
deviation. The DOIs could not be checked against Crossref from this session
(the proxy refused `api.crossref.org`); they are the publishers' DOIs as
cited in the literature.

## Input

```
lat,lon,hs_m
-70,-170,2.06
-70,-160,2.28
```

CSV or tab-separated. Header names pick the columns: `lon`/`lat` (or
`longitude`/`latitude`) for degrees, `x`/`y` or `easting`/`northing` for a
flat map in one unit. The value is the first other numeric column unless you
name one. Without a header the first three columns are x, y, value. Readings
at the same place are averaged.

## Use it

- **Browser:** the live page, or open `index.html` from a checkout (served
  over http, since it loads ES modules).
- **CLI:** `node cli.mjs readings.csv [--model auto|spherical|exponential|gaussian|linear] [--predict x:y,x:y] [--csv|--loo|--json]`;
  `--help` for the rest (fixed variogram with `--nugget --psill --range`,
  `--estimator cressie`, `--lags`, `--max-lag`, `--mask`).
- **Agents:** `node platform/agents/tools.mjs call kriging-interpolation analyze --input '{"text":"x,y,v\n0,0,1\n1,0,2\n0,1,2\n1,1,3\n2,2,5","predictAt":[[0.5,0.5]],"grid":false}'`.
- **JavaScript:** `analyze({text, model, estimator, predictAt, gridX, mask})`,
  or the pieces: `parsePoints`, `empiricalVariogram`, `fitVariogram`,
  `krigingSystem(points, model, coords).predict({x, y})` and
  `.leaveOneOut()`.

## Verification

`node --test '*.test.mjs'` (about 3 s). Against independent references:

- **Covariance-form GLS predictor.** Ordinary kriging in variogram form must
  equal m + c'C^-1(z - m1) with the GLS mean, and its variance
  sill - c'C^-1c + (1 - 1'C^-1c)^2 / 1'C^-1 1, which the test solves with a
  separate Cholesky routine: equal to 1e-8 for all three models on 40
  points.
- **An exact result.** In one dimension with a linear variogram (Brownian
  motion), kriging is linear interpolation between neighbours, flat beyond
  the ends, with Brownian-bridge variance 2t(1-t)L: exact to 1e-9.
- **Dubrule's shortcut** equals a refit with each reading removed, to 1e-7.
- **A known truth.** `eval/simulate.mjs` draws 40 Gaussian random fields
  (exponential or spherical, nugget 0.1, sill 1.1, range 20 to 60 on a
  100 x 100 square), gives the tool 150 readings of each, and scores it at
  100 held-out sites (`eval/simulation.json`): the 95% bands covered
  **95.1%** of the 4,000 held-out values, the leave-one-out mean
  standardised squared error averaged **1.00**, the fitted range was
  within a median 4% of the truth, and kriging's held-out RMSE (0.632) beat
  inverse distance (0.696) on 36 of 40 fields and the nearest reading
  (0.792) on all 40.
- Property tests: exact at the readings, weights sum to one, invariance to
  moving and rotating the map, scaling, the chordal distance and the
  dateline, parsing.

**Real data.** ERA5 median significant wave height, January 2024, 371 ocean
points on a 10° grid (`data/SOURCE.md`). The exponential model wins (nugget
0.059 m², sill 1.12 m², practical range 15,100 km, longer than the widest
chord, so the sill is extrapolated and the tool says so). Left out one at a
time: kriging RMSE **0.390 m**, nearest point 0.505 m, inverse distance
0.623 m, overall mean 0.902 m. Global inverse distance loses even to the
nearest point because every far cell still gets weight. The mean
standardised squared error is 0.65, so on these data the bands are too wide
rather than too narrow. The biggest misses are sheltered water near land
(60°N 10°E: 0.22 m where the neighbours imply 2.2 m).

## Limits

Isotropic variogram (same in every direction), constant unknown mean (no
trend surface, no universal kriging), point estimates (no block kriging),
every reading in every estimate (up to 1,000 locations; about 1 s for 371 in
Node). No indicator kriging, co-kriging or log-normal back-transform. The map
grid is the readings' bounding box; cells farther than 1.5 times the median
spacing from any reading are hidden by default. On lon/lat the map is drawn
in plain longitude-latitude (not equal-area).

## No warranty

Free and as-is, without warranty of any kind. Not engineering, surveying,
environmental or other professional advice; a regulator, standard or
contract may require a different method. FSL-1.1-MIT licence.
