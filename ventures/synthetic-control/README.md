# Synthetic control: did my intervention work?

One state passed a law, one region got a new store format, one country went
through a shock: what would its outcome have been without it? This tool
builds a **synthetic control** (Abadie & Gardeazabal 2003; Abadie, Diamond &
Hainmueller 2010, 2015), a weighted average of untreated units that tracks
the treated unit before the intervention, and reads the effect as the gap
afterwards. Weights are non-negative and sum to one, so the comparison is a
visible mix of real peers.

**Live:** https://marisstella.app/synthetic-control/ (runs in your browser;
nothing is uploaded).

## What you get

- Donor weights and the predictor balance table (treated, synthetic, donor
  mean, and the importance V of each predictor).
- The treated and synthetic paths, the gap in every period, its post-period
  average and the post/pre RMSPE ratio.
- **Placebo-in-space inference** (ADH 2010): the whole fit rerun with every
  donor as the treated unit, the treated unit's rank by RMSPE ratio and the
  permutation p-value, with an optional 20x/5x/2x pre-fit screen.
- **Leave-one-out** (ADH 2015): every donor with positive weight dropped in
  turn, with a warning when one drop flips the sign on a comparable fit.
- V chosen three ways: nested (minimise pre-period outcome error, Synth's
  default), cross-validated on two halves of the pre-period (ADH 2015), or
  equal. With no covariates, every pre-period outcome is a predictor.
- A summary in words, warnings when the treated unit is outside the donors'
  range on a predictor, and a CSV of the paths.

## Use it

```
node cli.mjs --example
node cli.mjs panel.csv --unit state --time year --outcome sales --treated California --at 1989 \
  [--covariates price,income] [--donors A,B,C] [--v nested|cv|equal] [--pre-filter 5] [--csv|--json]
node platform/agents/tools.mjs call synthetic-control analyze --input '{"csv":"...","unit":"state","time":"year","outcome":"sales","treated":"California","treatmentTime":1989}'
```

`analyze()` in `engine.mjs` also takes a full predictor specification
(`predictors: [{variable, times}]`, `optimizeTimes`, `train`) as
`example-data.mjs` shows for the paper's setup.

## Method

Predictors are averaged over their windows (missing cells skipped) and
scaled by their standard deviation across units. For diagonal V the weights
solve `min (X1 - X0 W)' V (X1 - X0 W)` over the simplex, by an exact primal
active-set method (Nocedal & Wright, Algorithm 16.3, with a 1e-10 relative
ridge so singular problems stay solvable). V is searched by Nelder-Mead
(1965) over `|x| / sum |x|` from equal weights, with SciPy's default
coefficients, initial simplex and stopping rule, as pysyncon and Synth do.
Papers, with what was implemented and every deviation, are in `PAPERS` in
`engine.mjs`, on the page and in `--help`.

## Verification

`node --test *.test.mjs` (37 tests). `eval/reference.py` runs **pysyncon
1.7.0** (MIT; its own parity tests pin it to R's Synth) on the example and
writes `eval/reference.json` (numpy 2, scipy 1.18.1, pandas 3.0.5). The tests check:

- ADH 2015 West Germany with the paper's cross-validated V: every donor
  weight within 0.01 of the reference (Austria 0.413 vs 0.415, USA 0.216 vs
  0.216, Japan 0.163 vs 0.162, Switzerland 0.109 vs 0.108, Netherlands 0.099
  vs 0.098), the training V within 0.03, the synthetic path within 0.5% in
  every year 1960-2003, and the 1990-2003 average gap within 1% of the
  reference and of pysyncon's R-pinned -1,555.13.
- Given pysyncon's V, the inner solve lands on its weights within 0.002.
- Nested V and the outcome-only fit: the pre-period MSPE is at or below
  pysyncon's (13,396 vs 14,765 and 5,522 vs 5,627: the exact inner solver
  and SLSQP stop at different points, so these are compared by objective,
  not weights).
- The active-set solver matches brute-force enumeration of supports on 200
  seeded random problems; Nelder-Mead finds the Rosenbrock minimum.
- Planted panels: an exact 0.6/0.4 mix is recovered to 1e-6 with zero
  pre-period error and the planted effect as the average gap; rescaling the
  outcome scales the effect; shuffling rows changes nothing.
- Page tests: disclaimer, FAQ JSON-LD matches the page, no network calls,
  every scripted element exists, the example equals `data/germany.csv`.

On the example West Germany ranks first of 17 by RMSPE ratio (p = 1/17,
the smallest possible), and the summary flags that dropping the USA flips
the sign only on a refit whose pre-period error is seven times larger.

## Limits

One treated unit; no interference between units; the treated unit must lie
inside the donors' range; placebo p-values are ranks bounded below by
1/(J+1). Not modelled: augmented or penalised synthetic control, in-time
placebos, conformal intervals, non-numeric time.

**No warranty.** Statistical output from data you supply, not legal, tax,
financial, medical or policy advice. Not affiliated with the authors of the
cited papers, pysyncon or Synth. MIT licence.
