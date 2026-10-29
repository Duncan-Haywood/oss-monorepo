# Example data: Nile river flow at Aswan, 1871-1970

`nile.csv`: annual discharge of the Nile at Aswan, in 10^8 cubic metres, 100
years. It is the textbook changepoint example, first analysed for a change by
Cobb (1978), who found the level dropped after 1898.

- **Retrieved:** 2026-10-20 from
  <https://raw.githubusercontent.com/statsmodels/statsmodels/main/statsmodels/datasets/nile/nile.csv>
  (byte-identical values to R's `datasets::Nile`).
- **Licence:** public domain. statsmodels' dataset module states "This is
  public domain." (`statsmodels/datasets/nile/data.py`, `COPYRIGHT`).
- **Cite:** Cobb, G. W. (1978). The problem of the Nile: conditional solution
  to a changepoint problem. *Biometrika* 65(2), 243-251.
  doi:10.1093/biomet/65.2.243.

`../example-data.mjs` embeds the same rows so the static page can load them.

# Example data: English Wikipedia pageviews of "Payroll", 2023-2024

`payroll-views.csv`: daily views (agent `user`, all access) of the article
"Payroll", 731 days from 2023-01-01 to 2024-12-31.

- **Retrieved:** 2026-10-21 from the Wikimedia REST API,
  `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Payroll/daily/20230101/20241231`.
- **Licence:** Wikimedia pageview data is released under CC0 (Wikimedia
  Foundation Terms of Use for the Analytics datasets).
- **Used by:** `eval/holiday-real.mjs`.

# Example data: US real GDP growth, 1959Q2-2009Q3

`us-gdp-growth.csv`: quarterly growth of US real GDP, annualised
(`400 * ln(GDP_t / GDP_t-1)`, % points), 202 quarters, computed from the
`realgdp` column of statsmodels' `macrodata` dataset.

- **Retrieved:** 2026-10-24 from the statsmodels 0.14+ source distribution on
  PyPI (`statsmodels/datasets/macrodata/macrodata.csv`).
- **Licence:** public domain. statsmodels' dataset module states "This is
  public domain." (`data.py`, `COPYRIGHT`); the underlying figures are US
  Bureau of Economic Analysis data via FRED.
- **Cite (the documented break):** McConnell, M. M. and Perez-Quiros, G.
  (2000). Output fluctuations in the United States: what has changed since
  the early 1980s? *American Economic Review* 90(5), 1464-1476.
- **Used by:** `eval/great-moderation.mjs`, `great-moderation.test.mjs`.

# Example data: UK driver casualties, 1969-1984

`uk-driver-deaths.csv`: monthly totals of car drivers in Great Britain killed or seriously
injured (R's `datasets::UKDriverDeaths`), 192 months, January 1969 to December 1984.
The `month` column is built from the row order of the source.

- **Retrieved:** 2026-10-26 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/UKDriverDeaths.csv>.
- **Licence:** a published count series (Harvey and Durbin 1986); R's
  `datasets` package is GPL-2 or later. Only the 192 numbers are used here.
- **Cite (the documented break):** Harvey, A. C. and Durbin, J. (1986). The
  effects of seat belt legislation on British road casualties: a case study
  in structural time series modelling. *Journal of the Royal Statistical
  Society A* 149(3), 187-227. The front-seat belt law took effect on 31 January 1983.
- **Used by:** `eval/seatbelt-law.mjs`, `seatbelt-law.test.mjs`.

# Example data: British coal-mining disasters, 1851-1962

`coal-mining-disasters.csv`: yearly counts (112 years, 191 events) of British coal-mining disasters killing ten or more
men. The textbook Poisson changepoint example (rate about 3 a year, then about 1 from roughly 1890).

- **Retrieved:** 2026-10-26 from the R `boot::coal` event dates via
  <https://vincentarelbundock.github.io/Rdatasets/csv/boot/coal.csv> (191 fractional-year dates), binned by
  `floor(date)`; years with no event are 0.
- **Licence:** the `boot` package is GPL-2 | GPL-3 and the series is a published historical record
  (a list of dated events, no creative expression); only the yearly counts are kept here.
- **Cite:** Jarrett, R. G. (1979). A note on the intervals between coal-mining disasters. *Biometrika* 66(1), 191-193.
- **Used by:** `coal-disasters.test.mjs`.

# Example data: daily foreign exchange returns, 2012-2018 (CHF, GBP, JPY)

`fx-daily-returns.csv`: daily log returns in percent of the Swiss franc, pound sterling and
yen against the US dollar (Federal Reserve H.10 rates), 1,750 trading days from 2012-01-04
to 2018-12-31, on the days all three are published. A currency's return is the log change
of its rate from the previous published day (the dataset gives GBP as USD per pound, so a
rise is a stronger pound; CHF and JPY are per USD, so a rise is a weaker franc or yen).

- **Retrieved:** 2026-10-26 from
  <https://raw.githubusercontent.com/datasets/exchange-rates/main/data/daily.csv>
  (originally FRED, series DEXSZUS, DEXUSUK, DEXJPUS).
- **Licence:** Open Data Commons Public Domain Dedication and Licence 1.0, per that
  repository's `datapackage.json`.
- **Used by:** `eval/fx-shocks.mjs`, `fx-shocks.test.mjs`.

# Example data: UK gas consumption, 1960-1986

`uk-gas.csv`: quarterly UK gas consumption, 108 quarters, 1960Q1 to 1986Q4 (R's
`datasets::UKgas`, millions of therms). The `quarter` column is built from the
`time` column of the source.

- **Retrieved:** 2026-10-27 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/UKgas.csv>.
- **Licence:** a published series (Durbin and Koopman, *Time Series Analysis by
  State Space Methods*); R's `datasets` package is GPL-2 or later. Only the 108
  numbers are used here.
- **Used by:** `eval/uk-gas.mjs`, `uk-gas.test.mjs`.

## airline-passengers.csv

Monthly international airline passengers (thousands), January 1949 to December
1960, 144 rows (Box and Jenkins, *Time Series Analysis*, series G).

- **Retrieved:** 2026-10-27 from
  <https://raw.githubusercontent.com/jbrownlee/Datasets/master/airline-passengers.csv>.
- **Licence:** a published series of 144 numbers; only those are used here.
- **Used by:** `airline-passengers.test.mjs`.

## lake-huron.csv

Annual mean level of Lake Huron, 1875 to 1972, 98 rows, feet (R's `datasets::LakeHuron`,
from Brockwell and Davis, *Time Series and Forecasting*).

- **Retrieved:** 2026-10-27 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/LakeHuron.csv>.
- **Licence:** a published series of 98 numbers; only those are used here.
- **Used by:** `lake-huron.test.mjs`.

# Example data: US quarterly CPI inflation, 1959Q2-2009Q3

`us-inflation.csv`: annualised quarterly CPI inflation (%), 202 quarters, the `infl` column of
statsmodels' `macrodata` dataset (first quarter dropped: it is 0.00 by construction).

- **Retrieved:** 2026-10-27 from the statsmodels 0.15 install (`statsmodels/datasets/macrodata`).
- **Licence:** public domain (statsmodels' `COPYRIGHT`; underlying BLS data via FRED).
- **Cite (the documented regimes):** Stock, J. H. and Watson, M. W. (2007). Why has US inflation become
  harder to forecast? *Journal of Money, Credit and Banking* 39(s1), 3-33.
- **Used by:** `eval/us-inflation.mjs`, `us-inflation.test.mjs`.

# Example data: Nottingham monthly air temperature, 1920-1939

`nottem.csv`: 240 monthly mean air temperatures (deg F) at Nottingham Castle, the `nottem` series of R's `datasets`.

- **Retrieved:** 2026-10-27 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/nottem.csv>.
- **Licence:** a published series of 240 numbers; only those are used here.
- **Cite:** Anderson, O. D. (1976). *Time Series Analysis and Forecasting: The Box-Jenkins approach*. Butterworths.
- **Used by:** `nottem.test.mjs`.

# Example data: DAX daily log returns, 1991-1998

`dax-returns.csv`: `100 * ln(DAX_t / DAX_t-1)` for the 1,859 daily returns of the DAX index in R's
`EuStockMarkets` (business days, 1991-07 to 1998-08). The `row` column is the dataset's own row number (the
return for row 2 onward); no calendar dates are carried.

- **Retrieved:** 2026-10-27 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/EuStockMarkets.csv>.
- **Licence:** Rdatasets lists the package's licence per dataset; `EuStockMarkets` ships with base R (GPL-2 or
  later). Only a derived column of returns is kept here: check the licence before reusing it elsewhere.
- **Used by:** `dax-returns.test.mjs`.

# Example data: great inventions and discoveries, 1860-1959

`great-discoveries.csv`: yearly counts (100 years, 310 events) of "great" inventions and scientific discoveries
from The World Almanac and Book of Facts, as in R's `datasets::discoveries`.

- **Retrieved:** 2026-10-27 from statsmodels' `get_rdataset('discoveries', 'datasets')` (Rdatasets mirror).
- **Licence:** the R `datasets` package is GPL-2 | GPL-3; the series is a published list of yearly counts (no creative
  expression), and only the counts are kept here.
- **Used by:** `great-discoveries.test.mjs`.

# Example data: Johnson & Johnson quarterly earnings per share, 1960-1980

`johnson-johnson.csv`: quarterly earnings per share in US dollars, 84 quarters (R's `datasets::JohnsonJohnson`).

- **Retrieved:** 2026-10-28 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/JohnsonJohnson.csv>
  (time 1960.25 steps rewritten as `1960Q2` labels).
- **Licence:** R's `datasets` package is GPL-2 or later as a package; the 84 numbers are company-reported facts. Not checked further.
- **Used by:** `johnson-johnson.test.mjs`.

# Example data: short-term visitor arrivals to Australia from the US and Japan, 1981Q1-2012Q3

`au-arrivals-us.csv`, `au-arrivals-japan.csv`: quarterly arrivals in thousands, 127 quarters (the `US` and `Japan` columns of `fpp2::arrivals`).

- **Retrieved:** 2026-10-29 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/arrivals.csv> (row numbers rewritten as `1981Q1` labels).
- **Licence:** the fpp2 package is GPL-3; the series are published counts. Not checked further.
- **Used by:** `drift-warning-arrivals.test.mjs`, `eval/drift-warning-arrivals.mjs`.

# Example data: UK lung deaths 1974-79 and US accidental deaths 1973-78

`uk-ldeaths.csv`, `uk-mdeaths.csv`, `uk-fdeaths.csv`: monthly UK deaths from
bronchitis, emphysema and asthma, all / male / female, 72 months from 1974-01.
`us-accidental-deaths.csv`: monthly US accidental deaths, 72 months from 1973-01.
R's `datasets::ldeaths`, `mdeaths`, `fdeaths` and `USAccDeaths`.

- **Retrieved:** 2026-10-29 from the Rdatasets mirror,
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/>
  (`ldeaths.csv`, `mdeaths.csv`, `fdeaths.csv`, `USAccDeaths.csv`).
- **Licence:** R's datasets package is GPL-2/3; the figures are national
  statistics counts (Diggle 1990; Brockwell and Davis 1991). Used here as
  test data only.
- **Used by:** `eval/drift-warning-trendless.mjs`.

# Example data: Ansett Melbourne-Sydney economy-class passengers, 1987-1992

`ansett-melsyd-economy.csv`: weekly economy-class passengers (thousands) on
Ansett's Melbourne-Sydney route, 283 weeks from 1987-06-29 (week start dates
computed from the series' start). R's `fpp2::melsyd`, column `Economy.Class`.
The airline's pilots' dispute from 18 August 1989 is in the data as seven zero
weeks.

- **Retrieved:** 2026-10-29 from the Rdatasets mirror,
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/melsyd.csv>.
- **Licence:** the fpp2 package is GPL-3 (Hyndman); the figures are airline
  traffic counts. Used here as test data only.
- **Used by:** `eval/ansett-strike.mjs`, `ansett-strike.test.mjs`.

# Example data: Puerto Rico daily deaths, 2015-2018 (Hurricane Maria)

`puerto-rico-daily-deaths.csv`: all-cause deaths per day in Puerto Rico, 1,201
days from 2015-01-01 to 2018-04-15 (R's `dslabs::pr_death_counts`). Hurricane
Maria made landfall on 2017-09-20.

- **Retrieved:** 2026-10-29 from the Rdatasets mirror,
  <https://vincentarelbundock.github.io/Rdatasets/csv/dslabs/pr_death_counts.csv>
  (columns `date`, `deaths`; the row-number column is dropped).
- **Licence:** the dslabs package is GPL-2 (Irizarry); the figures are
  government vital-statistics death counts. Used here as test data only.
- **Used by:** `eval/maria-deaths.mjs`, `maria-deaths.test.mjs`.

# Example data: euro-area electrical-equipment orders, 1996-2012

`eu-elecequip.csv`: monthly index of new orders of electrical equipment in the
euro area (2005 = 100), 195 months from 1996-01 to 2012-03 (R's
`fpp2::elecequip`; the row-number and decimal-year columns are replaced by a
`YYYY-MM` label). The late-2008 collapse and the 2009-10 recovery are the dated
shock.

- **Retrieved:** 2026-10-29 from the Rdatasets mirror,
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/elecequip.csv>.
- **Licence:** the fpp2 package is GPL-3 (Hyndman); the figures are Eurostat
  order indices. Used here as test data only.
- **Used by:** `eval/drift-warning-elecequip.mjs`, `drift-warning-elecequip.test.mjs`.

# Example data: US airline passenger miles, 1937-1960

`airmiles.csv`: revenue passenger miles flown by US commercial airlines each
year, 24 values (R's `datasets::airmiles`; columns renamed `year`, `miles`).
Growth is steady until the war ends, then the civil boom starts.

- **Retrieved:** 2026-10-29 from the Rdatasets mirror,
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/airmiles.csv>.
- **Licence:** R datasets (GPL-2 or later with R); the figures are Civil
  Aeronautics Board statistics. Used here as test data only.
- **Used by:** `eval/airmiles.mjs`, `airmiles.test.mjs`.
