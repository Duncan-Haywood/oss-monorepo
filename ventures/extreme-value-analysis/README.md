# Extreme value analysis: 100-year levels with honest intervals

**Live:** https://marisstella.app/extreme-value-analysis/

Paste a record of annual maxima (river peaks, storm rainfall, wind gusts, peak electrical
load, the largest claim each year) or a long daily or hourly series, and get return levels:
the value with a 1-in-*T* chance of being exceeded in a year. It fits

- a **GEV** and a **Gumbel** to the annual maxima, with a likelihood-ratio test between them,
  L-moment estimates as a cross-check, and a GEV whose location drifts linearly with the year;
- a **generalized Pareto** to the declustered **peaks over a threshold** of a long series,
  with the extremal index, a mean-residual-life table and a threshold-stability table;
- **profile-likelihood intervals** for every return level and shape, beside the delta-method
  intervals most tools print;
- the chance of at least one exceedance over a **design life**.

Free to use and source available (FSL-1.1-MIT). Runs in the browser; nothing is uploaded. Zero dependencies.

**No warranty.** Statistical estimates from the data you supply, not engineering, legal, tax
or financial advice, and not a flood study. US federal flood frequency analysis follows
Bulletin 17C (log-Pearson Type III fitted by the expected moments algorithm, USGS PeakFQ);
design values come from codes and the agencies that publish them.

## Use it

- Browser: open `index.html` (or the live page), paste a CSV, press *Estimate return levels*.
- Command line: `node cli.mjs data/potomac-annual-peaks.csv` or
  `node cli.mjs data/potomac-daily-flow.csv --year-start 10 --run-length 7` (`--help` lists
  the options; `--json` prints everything).
- Agents: `node platform/agents/tools.mjs call extreme-value-analysis analyze --input '{"csv":"..."}'`
  from the repository root, or the same through its MCP server.

Input: a header row, a value column, and a year or a date column (YYYY-MM-DD or M/D/YYYY).
One row a year is read as annual maxima. A longer series gets both methods; `--year-start 10`
makes the blocks US water years. Years with fewer than 90% of a typical year's readings are left
out of the annual maxima and named. With no year or date, each row is taken as one year's
maximum.

## Example: the Potomac at Little Falls

The bundled data are USGS station 01646500 (`data/SOURCE.md`): 96 instantaneous annual peaks,
1931-2026, and 20 water years of daily mean flow, 2007-2026.

On the 96 annual peaks (cubic feet per second):

| | GEV | Gumbel |
| --- | --- | --- |
| 10-year | 220,920 (95% profile 193,300 to 264,439) | 211,674 |
| 100-year | 411,617 (321,492 to 621,207) | 327,302 |
| 500-year | 593,206 (416,229 to 1,091,338) | 406,697 |

The shape is 0.167 with profile interval 0.037 to 0.335: a heavy tail, and the likelihood-ratio
test rejects the Gumbel (6.99 on 1 df, p = 0.008). The Gumbel's 100-year level is 20% lower and
its interval excludes the GEV's estimate. The trend model finds no drift in the location (223 cfs
a decade, p = 0.87).

On the 20 years of daily flow, the GEV on water-year maxima gives a 100-year flow of 195,314,
and peaks over the 98th percentile (53,484 cfs; 147 exceedance days in 51 floods with a 7-day run
length, extremal index 0.35) give 199,305. Fitting the instantaneous peaks of the same 20 years
gives 203,047, so the halving is the record, not daily means against peaks: none of the six
floods above 300,000 cfs (1936, 1937, 1942, 1972, 1985, 1996) falls in the last 20 years. Their
profile intervals (up to about 330,000 to 350,000) are the honest part: the upper ends say a
short record cannot rule out much larger floods.

## Verification

Run `node --test` in this directory (or
`python3 platform/ci/run_venture_tests.py extreme-value-analysis` from the root).

- **Against scipy.** `eval/reference.py` fits the bundled data and five seeded simulated samples
  (GEV with shape 0.25, -0.2 and 0; GPD with shape 0.2 and -0.25) with scipy 1.18.1
  (`genextreme`, `gumbel_r`, `genpareto` with `floc=0`, each polished by a second optimiser) and
  re-implements runs declustering independently. `engine.test.mjs` requires the parameters to
  agree to 1e-5 relative or better, the negative log-likelihood here to be no worse than scipy's,
  and the water-year maxima, threshold and cluster count to match exactly. On the Potomac peaks
  the parameters agree to between 2e-9 and 4e-8.
- **Profile bounds.** A test refits the likelihood on a fine grid at the 100-year upper bound
  and checks that the deviance there equals the chi-square quantile (to 0.02).
- **Coverage by simulation.** `node eval/coverage.mjs 400` (seeded; output in
  `eval/coverage.json`) draws 400 GEV records for each setting and counts how often the 95%
  interval for the 100-year level contains the true value:

  | years | shape | delta method | profile likelihood |
  | --- | --- | --- | --- |
  | 30 | 0.1 | 86.0% | 94.0% |
  | 60 | 0.1 | 83.8% | 93.8% |
  | 60 | -0.2 | 84.3% | 93.3% |
  | 100 | 0.2 | 93.3% | 96.5% |

  With 400 draws the standard error of a coverage near 95% is about 1.1 points, so the
  delta method's shortfall at 30 to 60 years is well outside noise; the profile interval is
  within 1.7 points of nominal.
- Page tests check the disclaimer, labels, JSON-LD against the visible FAQ, no network calls,
  that every id the script uses exists, that the examples are the bundled files verbatim, and
  that the figures quoted on the page are the ones in `eval/`.

## Method

Coles (2001) throughout: the GEV likelihood and return levels (chapter 3), the GPD and
peaks over thresholds (chapter 4; Pickands 1975; Davison & Smith 1990), runs declustering
(5.3.2), a linear trend in location (chapter 6), delta-method (3.10, 4.15) and profile-likelihood
(2.6.5) intervals. L-moments: Hosking, Wallis & Wood (1985) and Hosking (1990). Shape sign:
Coles's (xi > 0 heavy). Maximisation: Nelder-Mead on (mu, log sigma, xi) from several starts,
observed information by central differences. The shape is kept in (-1, 3): below -1 the GEV
likelihood is unbounded (Smith 1985), and a shape below -0.5 draws a warning.

Not modelled: historical or censored floods, regional skew or pooling, seasonality,
covariates other than the year, and joint extremes.

## Files

`engine.mjs` (all statistics), `cli.mjs`, `index.html`, `example-data.mjs` (the two CSVs,
verbatim), `usage.mjs` (local-only counters with an opt-out), `data/`, `eval/`.
