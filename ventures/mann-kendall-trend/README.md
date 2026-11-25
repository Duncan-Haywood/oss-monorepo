# Mann-Kendall trend test with Sen's slope

**Is this series going up or down, by how much per year, and is it more than
noise?** Paste dates (or years) and values, and get the Mann-Kendall trend
test, Sen's slope with a confidence interval, a correction for readings that
follow on from each other, and for monthly or quarterly data the seasonal
Kendall test with the covariance between seasons and a test that every season
shares the trend. In the browser, from the command line, or from an agent.

**Live:** <https://marisstella.app/mann-kendall-trend/>

Who it is for: hydrologists and water-quality staff testing streamflow, nitrate
or groundwater levels; ecologists with yearly counts; climate and air-quality
analysts; anyone asked "is it getting worse?" about a series with a seasonal
cycle, outliers or a skewed distribution, where a least-squares line is the
wrong tool. Free, FSL-1.1-MIT licensed, nothing uploaded.

## What it computes

| Piece | Paper | What you get |
| --- | --- | --- |
| Mann-Kendall test | Mann 1945; Kendall 1975 | S, Kendall's tau, Z and the two-sided p-value; ties in values and in times; exact p-value for n ≤ 20 without ties |
| Sen's slope | Sen 1968 | median pairwise slope per year (dates) or per time unit, its distribution-free interval, the line through the median point |
| Serial correlation | Yue & Wang 2004 (default, AR(1) form); Hamed & Rao 1998 (all lags or first 3); Yue, Pilon, Phinney & Cavadias 2002 (trend-free pre-whitening) | every corrected test side by side, the variance inflation each implies, and a note when they disagree |
| Seasons | Hirsch, Slack & Smith 1982 | the seasonal Kendall test and slope by month, quarter or a season column |
| Between-season covariance | Hirsch & Slack 1984 | the covariance of the seasons' statistics (on by default from 10 years), with missing months handled |
| Homogeneity | van Belle & Hughes 1984 | chi-square test that the seasons share one trend, and each season's own test and slope |

## The example: 96 years of the Potomac River

The page loads the U.S. Geological Survey's monthly mean flow of the Potomac
at Little Falls, Washington DC (gauge 01646500, 1,159 months, public domain).
What the tool reports on it, from `node cli.mjs data/<file>.csv`:

- **Measured monthly flow:** seasonal Kendall with the Hirsch-Slack
  covariance, p = 0.557; Sen's slope +4.43 cfs per year (95% interval −10 to
  +19). No trend. Correlation between months multiplies the variance of S by
  3.32.
- **The adjusted record (withdrawals added back, 01646502, 1,142 months):**
  the seasonal test that treats months as independent says p = 0.0039,
  increasing. With the covariance, p = 0.113, and the interval (−2.94 to
  +27.2 cfs per year) includes zero. The verdict depends on accounting for a
  wet year raising every month at once, and the tool says so in its summary.
- **Annual flood peaks (96 years):** p = 0.851 with the Yue-Wang correction,
  Sen's slope −43.9 cfs per year (interval −527 to +415). No trend.

## Use it from code

```sh
node cli.mjs data/potomac-monthly-flow.csv                       # seasonal, by month
node cli.mjs data/potomac-annual-peaks.csv --correction hamed-rao
node cli.mjs series.csv --seasons none --json
node cli.mjs series.csv --season-column season --covariance on
node cli.mjs series.csv --csv > with-trend-line.csv
```

Agents: `node platform/agents/tools.mjs describe mann-kendall-trend` prints the
papers; `node platform/agents/tools.mjs call mann-kendall-trend analyze --input
'{"t":[2001,2002,2003,2004,2005],"x":[3.1,3.4,3.3,3.9,4.2]}'` (or
`{"csv":"..."}`, with `season` as an array of labels for the seasonal test).

From JavaScript: `analyze(input)` returns the summary, every test, Sen's slope
and the per-season table; `mannKendall`, `seasonalKendall`, `senSlope`,
`varS`, `exactP` and `yueWangFactor` are exported for direct use.

## Why Yue-Wang (AR(1)) is the default

`eval/size-simulation.mjs` runs each test on 1,000 trend-free AR(1) series for
each lag-1 coefficient and length, and counts how often it reports a trend at
the 5% level (`eval/size-simulation.json`). A test that holds its size scores
about 5%. At lag-1 correlation 0.6 and 100 readings:

| Test | Called a trend |
| --- | --- |
| No correction | 30% |
| Yue-Wang, AR(1) (this tool's default) | 6% |
| Hamed-Rao, first 3 lags | 11% |
| Hamed-Rao, all lags screened (pymannkendall's default) | 19% |
| Trend-free pre-whitening | 40% |
| Yue-Wang summing every lag (pymannkendall's default) | 51% |

The last row is the reason it is not offered: the sample autocorrelations of a
centred series sum to −1/2 over all lags, so summing every one drags the
variance factor towards zero (or below it) whatever the data. On white noise it
called a trend in 45-48% of series. The engine reproduces it exactly
(`yueWangFactor(resid, "all")`, tested against pymannkendall 1.4.3) so the
comparison can be checked, but the page and CLI only offer the AR(1) form. No
correction is right for strong or long-memory correlation: at 0.8 with 50
readings even the default reached 13%.

## Verification

`node --test *.test.mjs` (about 2 s). Reference values are in
`eval/reference.json`, produced by `eval/reference.py` with pymannkendall
1.4.3 (MIT) and scipy 1.17.1 (BSD-3-Clause); neither library's code is in the
engine.

- On the 96 annual peaks and the 1,140 monthly flows of the 95 complete years,
  S, Var S, Z and p of the plain, Hamed-Rao (all lags and first 3) and
  trend-free pre-whitened tests match pymannkendall to 1e-9, and the Yue-Wang
  AR(1) variant matches the formula written out independently in
  `reference.py`.
- Sen's slope, intercept and its 90% and 95% intervals match
  `scipy.stats.theilslopes`.
- Exact p-values for n = 8 and 15 match `scipy.stats.kendalltau(method="exact")`.
- The seasonal test's S, variance, Z, p and slope match pymannkendall's
  `seasonal_test`, the Hirsch-Slack variance matches `correlated_seasonal_test`,
  and the homogeneity chi-square matches scipy's `chi2.sf`.
- Kendall's variance with ties in both values and times equals the variance
  of S over all 5,040 orderings of a tied sample.
- With a fifth of the months missing, the Hirsch-Slack variance equals the
  variance of S across 3,000 simulated series to within 8%.
- A planted slope is recovered inside its interval; shuffling rows, shifting
  time and scaling values leave S and p unchanged; mirrored data mirror S.
- Normal tail, quantile and chi-square functions match scipy to 1e-12.

## Limits

- A trend is not a cause, and monotonic is not linear: a series that rose and
  then fell can test as no trend, and Sen's slope is not a forecast.
- Values below a detection limit (`<0.5`) are skipped with a warning; censored
  methods (Helsel 2012) are not implemented.
- The serial-correlation corrections count lags in rows and assume roughly
  even spacing; the tool warns when spacing is uneven.
- The Hirsch-Slack covariance needs one value per season per year; with more
  the tool treats seasons as independent and says so.
- Up to 20,000 readings and 8 million pairs for Sen's slope.

## Disclaimer

Free to use and source available (FSL-1.1-MIT). **No warranty.** Results are statistical estimates
from the data you supply, not legal, tax, financial, regulatory or other
professional advice, and the tool does not replace a qualified statistician
or a method a regulator prescribes. Not affiliated with the cited authors, the
USGS, pymannkendall or scipy.
