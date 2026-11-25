# Method comparison: Passing-Bablok, Deming regression and Bland-Altman

**Do the old and the new method agree, and where do they not?** Paste paired
readings (the same samples measured two ways) and get Passing-Bablok regression
with its confidence intervals and linearity test, Deming and weighted Deming
regression with jackknife intervals, the Bland-Altman bias and limits of
agreement, and the difference between the methods at your decision levels. In
the browser, from the command line, or from an agent.

**Live:** <https://marisstella.app/method-comparison/>

Who it is for: clinical laboratory scientists verifying a new analyser or assay
against the current one; quality managers writing a method-comparison section;
researchers comparing a cheap device with a reference instrument (cuffs,
wearables, point-of-care tests); students learning why least squares is the
wrong tool here. Free, FSL-1.1-MIT licensed, nothing uploaded.

## What it computes

| Piece | Paper | What you get |
| --- | --- | --- |
| Passing-Bablok regression | Passing & Bablok 1983; Sen 1968 | shifted median of all pairwise slopes, rank-based 95% intervals for slope and intercept, the counts of vertical, identical and −1 slopes |
| CUSUM linearity test | Passing & Bablok 1983 | statistic and p-value (Kolmogorov), points above and below the line |
| Deming regression | Cornbleet & Gochman 1979 | slope and intercept for a given error-variance ratio λ (or from both methods' repeatability SDs) |
| Weighted Deming | Linnet 1990 | the same for error proportional to the level, iterated to convergence |
| Jackknife intervals | Linnet 1990, 1993 | standard errors, covariance, t intervals for both Deming fits |
| Bland-Altman | Bland & Altman 1986, 1999 | bias, SD, limits of agreement with their intervals, absolute or percentage differences, trend tests |
| Decision levels | — | y − x at each level with a 95% interval (Deming jackknife; Passing-Bablok bootstrap up to 500 pairs) |
| Kendall's tau-b | Knight 1966 | the positive correlation Passing-Bablok assumes, in O(n log n) |
| Slope selection | Dillencourt, Mount & Netanyahu 1992 (counting idea) | Passing-Bablok order statistics without listing the slopes: 4,212 pairs, 8.85 million slopes, in one to two seconds |

## The example: mercury against oscillometric blood pressure

NHANES 2017-2018 ran a methodology study: each participant's blood pressure was
taken by a physician with a mercury sphygmomanometer and by a technician with an
Omron HEM-907XL oscillometric device, in random order, three readings each
(`data/SOURCE.md`). For 4,212 adults with all six systolic readings, from
`node cli.mjs data/nhanes-2017-2018-systolic.csv --levels 130`:

- **Bland-Altman:** the cuff reads 1.31 mmHg lower on average (95% CI 1.01 to
  1.61); limits of agreement −20.87 to +18.25 mmHg; 246 people outside them.
- **Least squares** gives slope 0.872, as if the cuff under-read high pressures by
  13%. **Passing-Bablok** gives 1.0232 (1.0003 to 1.0413), **Deming** 1.0172
  (0.9950 to 1.0395). The gap is the attenuation Cornbleet and Gochman described:
  the mercury reading has error too.
- **At 130 mmHg** the cuff is 1.23 mmHg below mercury (Deming, 0.87 to 1.58).
- **CUSUM:** no curvature (p = 0.88). The size of the differences grows with the
  level, so the tool also reports weighted Deming (slope 1.0243, 1.0040 to
  1.0446).

These describe the sample, not the U.S. population (no survey weights). The NCHS
report on the study (Ostchega et al. 2021) is the official analysis.

## Use it from code

```sh
node cli.mjs data/nhanes-2017-2018-systolic.csv --levels 120,130,140
node cli.mjs pairs.csv --x old --y new --sd-x 0.2 --sd-y 0.3      # lambda from repeatability
node cli.mjs pairs.csv --percent --json
node cli.mjs pairs.csv --csv > pairs-with-fits.csv
```

Agents: `node platform/agents/tools.mjs describe method-comparison` prints the
papers; `node platform/agents/tools.mjs call method-comparison analyze --input
'{"x":[...],"y":[...],"decisionLevels":[6]}'` (or `{"text":"csv..."}`).

## Verification

- **Independent reference** (`eval/make_reference.py`, numpy 2.5.3 and scipy
  1.18.1, written from the papers, not from `engine.mjs`): on 33 generated data
  sets (constant and proportional error, λ of 0.5, 1, 2 and 4) and the NHANES
  pairs, Deming matches numpy's closed form to 1e-10 and scipy's orthogonal
  distance regression to its own tolerance (1e-5); the jackknife matches an
  explicit refit of every leave-one-out set to 1e-9; weighted Deming matches a
  separate Python iteration to 1e-9 and fixed-weight ODR at the converged
  weights; Passing-Bablok matches every slope listed in exact fractions
  (NHANES: all 8.85 million with numpy on integer-scaled readings), slope and
  intervals to 1e-12, N and K exactly; Kendall's tau-b and its p-value match
  `scipy.stats.kendalltau`.
- **Fast against brute force:** on 400 random data sets with heavy ties,
  vertical pairs and slopes of exactly −1, slope selection by inversion
  counting gives the same slope, interval, N and K as sorting every slope.
- **Published example:** Bland and Altman's 1986 peak-flow data (17 people)
  give their bias −2.1 l/min, SD 38.8 and limits −79.7 to 75.5.
- **Simulation with a known truth** (`eval/simulate.mjs`, 1,000 data sets of
  60 pairs each; `eval/simulation.json`): 95% intervals covered the true slope
  95.5% (Deming) and 95.4% (Passing-Bablok) of the time with constant error,
  and 96.7% for weighted Deming with proportional error. The Passing-Bablok
  intercept interval covered 92.1% with constant error.
- **CUSUM calibration:** normalised by √(points off the line + 1) and referred
  to the Kolmogorov distribution, the test is conservative because the line is
  fitted to the same points: 0.0% and 0.1% false alarms at the nominal 5%, and
  87.8% power against a moderate quadratic. An earlier normalisation by
  √(points below the line + 1) gave 2.4%, 5.5% and 8.2% false alarms at n = 30,
  60 and 200, rising with n, so it was not used (`eval/cusum-normalisation.mjs`).
- `node --test` runs 37 tests: engine, CLI, page (every number on the page is
  recomputed from the engine), usage counting.

## Limits

One value per method per sample (average replicates first); no repeated-measures
Bland-Altman, regression-based or log-scale limits, or outlier rules. Up to 20,000
pairs. Passing-Bablok intervals at decision levels are bootstrapped up to 500 pairs.
λ is given, not estimated from duplicates.

## Licence and credits

MIT. Methods from the papers cited in `engine.mjs` (`PAPERS`) and on the page,
implemented from the papers; no code was copied. Data: CDC/NCHS (public domain);
Bland & Altman 1986 (published measurements).

**No warranty.** A statistical estimate from the readings you give, not medical,
laboratory accreditation, regulatory or other professional advice; a standard,
accreditation body or regulator may require a different protocol.
