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
- **Used by:** `eval/fx-shocks.mjs`, `fx-shocks.test.mjs`; the page's several-columns example (`example-fx.mjs`, pinned to this file by `multi-view.test.mjs`).

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

# Example data: SMI, CAC and FTSE daily log returns, 1991-1998

`smi-returns.csv`, `cac-returns.csv`, `ftse-returns.csv`: `100 * ln(X_t / X_t-1)` for the other three indices in R's
`EuStockMarkets`, same rows as `dax-returns.csv` (row 2 onward; no calendar dates).

- **Retrieved:** 2026-10-29 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/EuStockMarkets.csv>.
- **Licence:** as for the DAX file above (base R, GPL-2 or later; only derived returns are kept; check before reusing).
- **Used by:** `eu-markets.test.mjs`, `eval/eu-markets.mjs`.

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

# Example data: WWWusage and nhtemp (R datasets)

`www-usage.csv`: users logged on to an internet server each minute, 100 minutes
(R's `datasets::WWWusage`, columns renamed `time`, `users`). `nhtemp.csv`: mean
annual temperature at New Haven, Connecticut, 1912-1971, degrees F
(`datasets::nhtemp`, columns `year`, `temp`).

- **Retrieved:** 2026-10-29 from the Rdatasets mirror,
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/>
  `WWWusage.csv` and `nhtemp.csv`.
- **Licence:** R datasets (GPL-2 or later with R). Test data only.
- **Used by:** `wwwusage-nhtemp.test.mjs`.

# Example data: Ansett Melbourne-Sydney first-class passengers, 1987-1992

`ansett-melsyd-first.csv`: weekly first-class passengers (thousands) on the
same route, 270 weeks from 1988-03-28. R's `fpp2::melsyd`, column
`First.Class`. The first 13 weeks are dropped because week 13 of the source is
blank (not filled in). The dispute is in the data as seven zero weeks.

- **Retrieved:** 2026-10-29 from the same Rdatasets mirror as
  `ansett-melsyd-economy.csv`.
- **Licence:** fpp2 is GPL-3 (Hyndman); airline traffic counts, test data only.
- **Used by:** `eval/ansett-first.mjs`, `ansett-first.test.mjs`.

---

# Example data: all Ansett route and class series

`ansett-all.csv`: weekly passengers for 10 Ansett routes in economy, business and first class (7,407 rows, 30 series;
economy and first from 1987 W26, business from 1989 W28 to 1992 W47). Columns: rownames, Week (ISO year and week),
Airports, Class, Passengers. R's `tsibbledata::ansett` via the Rdatasets CSV mirror
(`vincentarelbundock/Rdatasets`, `csv/tsibbledata/ansett.csv`). Open data; fetched 2026-10-29.

- **Used by:** `eval/ansett-sweep.mjs`, `ansett-sweep.test.mjs`.

# Example data: lh and treering (quiet real series)

`lh.csv`: 48 luteinizing hormone levels in blood samples taken every 10 minutes, R's `lh`. `treering.csv`: 7,980
yearly tree-ring widths, 6000 BC to 1979, R's `treering`.

- **Retrieved:** 2026-10-30 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/lh.csv> and `.../treering.csv`.
- **Licence:** published series of numbers; only those are used here.
- **Cite:** Diggle, P. J. (1990). *Time Series: A Biostatistical Introduction*. Oxford University Press (`lh`);
  Donald A. Graybill, via the National Geophysical Data Center (`treering`).
- **Used by:** `quiet-series.test.mjs`.

# Example data: Canadian lynx and yearly sunspot numbers

`lynx.csv` (lynx trappings, Mackenzie River, 1821-1934) and `sunspot-year.csv` (yearly sunspot numbers, 1700-1988)
are R's `datasets::lynx` and `datasets::sunspot.year`, retrieved 2026-10-30 from the Rdatasets mirror,
`https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/`. Their own licences are not
stated there (sunspots: SIDC, Royal Observatory of Belgium); they are small public scientific series used for a
measurement, not redistributed as a product. Used by `eval/cyclic-series.mjs`.

---

# Example data: Peace Bridge monthly traffic, 2003-2015

`peace-bridge.csv`: monthly vehicle traffic (thousands) over the Peace Bridge
(Buffalo NY to Fort Erie ON), 156 months from 2003-01. R's
`Stat2Data::PeaceBridge2003`. The US land-border passport requirement (WHTI)
took effect on 2009-06-01, inside the 2008-09 recession.

- **Retrieved:** 2026-11-01 from the Rdatasets mirror,
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/Stat2Data/PeaceBridge2003.csv>.
- **Licence:** the Stat2Data package is GPL (Cannon et al.); the figures are
  bridge traffic counts. Used here as test data only.
- **Used by:** `eval/peace-bridge.mjs`, `peace-bridge.test.mjs`.

# Example data: US quarterly ex-post real interest rate, 1959Q2-2009Q3

`us-real-interest.csv`: the `realint` column of statsmodels' `macrodata` dataset (three-month Treasury bill rate minus
annualised CPI inflation, %), 202 quarters (first quarter dropped: 0 by construction).

- **Retrieved:** 2026-11-02 from
  <https://raw.githubusercontent.com/statsmodels/statsmodels/main/statsmodels/datasets/macrodata/macrodata.csv>.
- **Licence:** public domain (statsmodels' `COPYRIGHT`; underlying data via FRED).
- **Cite (the documented shifts, from memory, unread):** Garcia, R. and Perron, P. (1996). An analysis of the real
  interest rate under regime shifts. *Review of Economics and Statistics* 78(1), 111-125.
- **Used by:** `eval/us-real-interest.mjs`, `us-real-interest.test.mjs`.

# Example data: Capital Bikeshare daily rentals, 2011-2012

`bike-sharing-daily.csv`: casual and registered rentals per day in Washington DC, 731 days from 2011-01-01, with the dataset's own `holiday` flag (21 days). Dates converted to ISO; other columns dropped.

- **Retrieved:** 2026-11-02 from a GitHub copy of `day.csv` (justmarkham/DAT3); original: Fanaee-T and Gama, UCI Machine Learning Repository "Bike Sharing Dataset".
- **Licence:** CC BY 4.0 (UCI). Used here as test data only.
- **Used by:** `eval/holiday-bikes.mjs`, `holiday-bikes.test.mjs`.

# Example data: US civilian unemployment rate, 1959Q2-2009Q3

`us-unemployment.csv`: the `unemp` column of statsmodels' `macrodata` dataset, 202 quarters (same rows as
`us-gdp-growth.csv` and `us-real-interest.csv`).

- **Retrieved:** 2026-11-03 from
  <https://raw.githubusercontent.com/statsmodels/statsmodels/main/statsmodels/datasets/macrodata/macrodata.csv>.
- **Licence:** public domain (statsmodels dataset module, `COPYRIGHT`); underlying figures are US BLS data via FRED.
- **Used by:** `eval/us-unemployment.mjs`, `us-unemployment.test.mjs`.

# Example data: US daily births, 1978-1988

`us-births-daily.csv`: births per day (both sexes summed), 4,018 days, with a `holiday` column for six US federal holidays computed by rule.

- **Retrieved:** 2026-11-04 from
  <https://raw.githubusercontent.com/jakevdp/PythonDataScienceHandbook/master/notebooks/data/births.csv>
  (CDC / NCHS birth counts; US government statistics, public domain).
- **Used by:** `eval/holiday-births.mjs`, `holiday-births.test.mjs`.

# Example data: Australian residents, quarterly 1971-1993

`austres.csv`: quarterly Australian resident population (thousands), R's `datasets::austres` (89 rows).

- **Retrieved:** 2026-11-04 from <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/austres.csv>.
- **Licence:** R datasets (GPL-2 | GPL-3 package; the numbers are Australian Bureau of Statistics counts, facts). Used as a test fixture only.
- **Cite:** Australian Bureau of Statistics, via R `datasets::austres`.

`us-real-gdp.csv`: real GDP in billions of chained 1996 dollars, quarterly 1950Q1 to 2000Q4 (204 rows), the `gdp` column of R's
`AER::USMacroG` (data from Greene's *Econometric Analysis*, US BEA figures).

- **Retrieved:** 2026-11-04 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/AER/USMacroG.csv>. Quarter labels (`1950Q1` onward) were added from row order.
- **Licence:** underlying US government statistics are public domain; the R package AER is GPL-2/GPL-3 and its copy of the table is used here as data only.
- **Used by:** `eval/noise-floor-gdp.mjs`, `noise-floor-gdp.test.mjs`.

`us-labor-productivity.csv`: US nonfarm business sector real output per hour, index 2017=100, seasonally adjusted, quarterly 1947Q1 to 2026Q2 (318 rows), FRED series `OPHNFB` (US Bureau of Labor Statistics).

- **Retrieved:** 2026-11-04 from <https://fred.stlouisfed.org/graph/fredgraph.csv?id=OPHNFB>. Quarter labels (`1947Q1` onward) were made from the date column.
- **Licence:** US government statistics, public domain. Revisions after the retrieval date will change later values slightly.
- **Used by:** `eval/slope-productivity.mjs`, `slope-productivity.test.mjs`.

## presidents.csv

`presidents.csv`: Gallup quarterly approval of the US president (percent), 1945Q1 to 1974Q4. Six quarters are missing
in the source (NA) and are dropped, not filled, leaving 114 rows.

- **Retrieved:** 2026-11-04 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/presidents.csv> (R `datasets::presidents`).
- **Licence:** distributed in R's datasets package (GPL-2 or later); a short table of facts.
- **Documented events:** Eisenhower's inauguration (1953Q1), the Vietnam escalation, Watergate (1973).

# Example data: Argentina consumer prices, 1970Q2-1989Q4

`argentina-inflation.csv`: the quarterly log change of Argentina's consumer price index (79 values), computed from
`ArgentinaCPI` in the R package AER (index, 1969Q4 = 1; online complements to Franses 1998, from De Ruyter van
Steveninck 1996).

- **Retrieved:** 2026-11-05 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/AER/ArgentinaCPI.csv>
  (the Rdatasets collection; AER is GPL-2/3 as software, the 80 index values are a published statistic).
- **Transform:** `log(cpi[t]) - log(cpi[t-1])`, five decimals.
- **Cite:** Franses, P. H. (1998). *Time Series Models for Business and Economic Forecasting*. Cambridge UP.
- **Used by:** `argentina-inflation.test.mjs`.

# Example data: West German unemployment rate, 1962Q1-1991Q4

`german-unemployment.csv`: quarterly unemployment rate (% of the labour force), 120 quarters, unadjusted and
seasonally adjusted, from `GermanUnemployment` in the R package AER (online complements to Franses 1998). The quarter
labels are added here (the source has row numbers; the series is 30 years of four quarters, with the winter quarter high).

- **Retrieved:** 2026-11-05 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/AER/GermanUnemployment.csv>
  (the Rdatasets collection; AER is GPL-2/3 as software, the 240 rates are a published statistic).
- **Cite:** Franses, P. H. (1998). *Time Series Models for Business and Economic Forecasting*. Cambridge UP.
- **Used by:** `german-unemployment.test.mjs`, `multi-view.test.mjs` (the joint over-cut warning).

# Example data: Florida frozen orange juice prices, 1950-2000

`frozen-juice.csv`: monthly price index of frozen orange juice concentrate (`price`), the producer price index (`ppi`)
and `fdd`, the month's freezing degree days in Orlando, 612 months, from `FrozenJuice` in the R package AER (Stock and
Watson, *Introduction to Econometrics*). Month labels are added here. The big-`fdd` months (19 or more) are the
measured freeze shocks used as ground truth.

- **Retrieved:** 2026-11-05 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/AER/FrozenJuice.csv>
  (Rdatasets; AER is GPL-2/3 as software, the values are a published statistic).
- **Used by:** `frozen-juice.test.mjs`, `eval/frozen-juice.mjs`.

## michigan-huron.csv

Yearly average level of Lakes Michigan-Huron (one lake hydraulically), 1918 to 2009, 92 rows, in metres
(`michHuron` column of DAAG's `greatLakes`, from the Great Lakes water-level records).

- **Retrieved:** 2026-11-06 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/DAAG/greatLakes.csv>.
- **Licence:** a published series of 92 numbers; only those are used here.
- **Used by:** `michigan-huron.test.mjs`.

# Example data: US personal saving rate, monthly 1967-2015

`us-saving-rate.csv`: personal saving as a percentage of disposable income
(FRED series PSAVERT), 574 months from 1967-07 to 2015-04.

- **Retrieved:** 2026-11-06 from the `psavert` column of ggplot2's `economics`
  data, <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/ggplot2/economics.csv>.
- **Licence:** US Bureau of Economic Analysis data via FRED, a US government
  work in the public domain; the Rdatasets copy is as published by ggplot2 (MIT).

# Example data: Box-Jenkins sales and US census population

`bjsales.csv`: 150 company sales values (Box and Jenkins, *Time Series Analysis*, series M), R's `datasets::BJsales`.
`uspop.csv`: US census population in millions, 1790 to 1970 (19 rows), R's `datasets::uspop`.

- **Retrieved:** 2026-11-06 from <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/BJsales.csv> and `.../uspop.csv`.
- **Licence:** R datasets (GPL-2 | GPL-3 package); the numbers are published sales figures and census counts. Used as a test fixture only.
- **Used by:** `eval/smooth-pair.mjs`, `smooth-pair.test.mjs`.

# Example data: US median duration of unemployment, monthly 1967-2015

`us-unemployment-duration.csv`: median weeks unemployed (FRED series UEMPMED), 574 months from 1967-07 to 2015-04.

- **Retrieved:** 2026-11-06 from the `uempmed` column of ggplot2's `economics`
  data, <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/ggplot2/economics.csv>.
- **Licence:** US Bureau of Labor Statistics data via FRED, a US government
  work in the public domain; the Rdatasets copy is as published by ggplot2 (MIT).
- **Used by:** `us-unemployment-duration.test.mjs`.

# Example data: Australian beer production, 1956-2010

`ausbeer.csv`: quarterly beer production in Australia, 218 quarters, 1956Q1 to
2010Q2 (megalitres; `ausbeer` from the R package fpp2, Hyndman). The `quarter`
column is built from the `time` column of the source.

- **Retrieved:** 2026-11-07 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/ausbeer.csv>.
- **Licence:** fpp2 is GPL-3; the numbers are the Australian Bureau of Statistics'
  published series. Only the 218 numbers are used here.
- **Used by:** `eval/ausbeer.mjs`, `ausbeer.test.mjs`.

# Example data: Boston Marathon winning times, 1897-2016

`boston-marathon.csv`: winning time in minutes for each year, 120 values (`marathon` from fpp2, Hyndman).

- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/marathon.csv>.
- **Licence:** fpp2 is GPL-3; the numbers are the Boston Athletic Association's published results. Only the 120 numbers are used here.
- **Used by:** `eval/boston-marathon.mjs`, `boston-marathon.test.mjs`.

## saudi-oil.csv

`saudi-oil.csv`: annual oil production in Saudi Arabia, millions of tonnes, 1965-2013, 49 values (`oil` from fpp2, Hyndman).

- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/oil.csv> (values rounded to 3 places).
- **Licence:** fpp2 is GPL-3 on CRAN; the figures are public production statistics. Kept as a small test fixture with its source named.
- **Used by:** `saudi-oil.test.mjs`.

## au-departures.csv (added 2026-11-08)

- **What:** monthly short-term resident departures from Australia, thousands, 498 months 1976-01 to 2017-06 (the `resshort` column of `fpp2::departures`).
- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/departures.csv> (month labels added from the series start).
- **Licence:** fpp2 is GPL-3 on CRAN; the figures are public ABS statistics. Kept as a small test fixture with its source named.
- **Used by:** `au-departures.test.mjs`.

# Example data: Australian air transport passengers, 1970-2016

`ausair.csv`: annual passengers in millions, 47 values (`ausair` from fpp2, Hyndman).

- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/ausair.csv>.
- **Licence:** fpp2 is GPL-3; the numbers are published Australian aviation statistics. Only the 47 numbers are used here.
- **Used by:** `eval/ausair.mjs`, `ausair.test.mjs`.

## us-female-murder-rate.csv (added 2026-11-08)

`us-female-murder-rate.csv`: US female murder rate per 100,000 standard population, 1950-2004, 55 values (`wmurders` from fpp2, Hyndman).

- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/wmurders.csv> (values rounded to 3 places).
- **Licence:** fpp2 is GPL-3 on CRAN; the figures are public US vital statistics. Kept as a small test fixture with its source named.
- **Used by:** `eval/us-female-murder-rate.mjs`, `us-female-murder-rate.test.mjs`.

# Example data: Australian quarterly cement production, 1956Q1-2014Q1

`qcement.csv`: 233 quarters of Australian portland cement production (millions
of tonnes), the `qcement` series of R's fpp2 package (Hyndman).

- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/qcement.csv>
  (the `time` column turned into `YYYYQn` labels).
- **Licence:** fpp2 is GPL-3; Rdatasets redistributes it. The values are
  Australian Bureau of Statistics counts, kept here as a test fixture.
- **Used by:** `qcement.test.mjs`, README "Cement and the 2000 GST".
## nightingale-disease.csv (2026-11-08)

- **What:** monthly Crimean War British army deaths from disease per 1,000 per year, April 1854 to March 1856 (24 points), the `Disease.rate` column of Florence Nightingale's data.
- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/HistData/Nightingale.csv>.
- **Licence:** HistData is GPL-2 on CRAN; the figures are 1850s public statistics. Kept as a small test fixture with its source named.
- **Used by:** `nightingale.test.mjs`, README "A documented fall in 24 points".
## us-electricity.csv (added 2026-11-08)

`us-electricity.csv`: US monthly net electricity generation, billion kWh, 1973-01 to 2013-06, 486 values (`usmelec` from fpp2, Hyndman).

- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/usmelec.csv> (time column turned into `YYYY-MM` labels).
- **Licence:** fpp2 is GPL-3 on CRAN; the figures are public US statistics. Kept as a small test fixture with its source named.
- **Used by:** `us-electricity.test.mjs`.

## au-gas.csv (added 2026-11-08)

`au-gas.csv`: Australian monthly gas production, 1956-01 to 1995-08, 476 values, unit as in the source (`gas` from the R forecast package, Hyndman).

- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/forecast/gas.csv> (time column turned into `YYYY-MM` labels).
- **Licence:** forecast is GPL-3 on CRAN; the figures are public statistics. Kept as a small test fixture with its source named.
- **Used by:** `au-gas.test.mjs`.

## us-ip-growth.csv (added 2026-11-08)

`us-ip-growth.csv`: annualised monthly growth of US industrial production, 1200 x ln(IP_t / IP_t-1), 1947-02 to 2004-12, 695 values (`production` in `USMacroSWM` from R's AER package, Stock and Watson data).

- **Retrieved:** 2026-11-08 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/AER/USMacroSWM.csv> (row 1 is 1947-01; logs differenced here).
- **Licence:** AER is GPL-2/3 on CRAN; the figures are public US statistics. Kept as a small test fixture with its source named.
- **Used by:** `ip-growth.test.mjs`.

# Example data: Australian monthly café turnover, 1982-04 to 2017-09

`auscafe.csv`: 426 months of Australian café, restaurant and catering turnover (billions of dollars), the `auscafe` series of R's fpp2 package (Hyndman).

- **Retrieved:** 2026-11-09 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/auscafe.csv>
  (the `time` column turned into `YYYY-MM` labels; the series starts 1982-04).
- **Licence:** fpp2 is GPL-3; Rdatasets redistributes it. The values are Australian Bureau of Statistics figures, kept here as a test fixture.
- **Used by:** `auscafe.test.mjs`, README "Cafés and the 2000 GST".

# Example data: US monthly CPI inflation, 1947-02 to 2004-12

`us-cpi-monthly.csv`: 1200 x ln(CPI_t / CPI_t-1), 695 months (`cpi` in `USMacroSWM` from R's AER package, Stock and Watson data; row 1 is 1947-01, logs differenced here).

- **Retrieved:** 2026-11-09 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/AER/USMacroSWM.csv>.
- **Licence:** AER is GPL-2/3 on CRAN; the figures are public US statistics. Kept as a small test fixture with its source named.
- **Used by:** `us-cpi-monthly.test.mjs`.

# Example data: Dow Jones Industrial Average daily returns, 1980-01-03 to 2012-12-31

`djia-returns.csv`: 8,609 daily log returns in percent (100 x ln(P_t / P_t-1)) of the DJIA close, from the `DJIA8012` series in R's AER package (first close 1980-01-02 is the base).

- **Retrieved:** 2026-11-09 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/AER/DJIA8012.csv>.
- **Licence:** AER is GPL-2/3 on CRAN; the figures are public index levels. Kept as a test fixture with its source named.
- **Used by:** `djia-returns.test.mjs`, README "Dow Jones returns: 1987 and 2008".
canada-fertility.csv: Canada total fertility rate 1931-1968 (carData::Hartnagel, column tfr via Rdatasets).

## us-tbill-1m-changes.csv

- **What:** month-on-month change of the US 1-month Treasury yield (`r1`, % per year), 1947-01 to 1991-02, 530 changes, computed from the levels.
- **Retrieved:** 2026-11-09 from <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/Ecdat/Irates.csv> (Ecdat, monthly 1946-12 to 1991-02).
- **Licence:** Ecdat is GPL-2/3 on CRAN; public yields. Kept as a test fixture with its source named.
- **Used by:** `tbill-volatility.test.mjs`, README "Treasury yield volatility: the 1979 to 1982 regime".

## global-temp-annual.csv

- **What:** global mean surface temperature anomaly (degrees C against the 1951-80 base), annual mean of the 12 monthly values, 1880-2024, 145 values (`GCAG` source in the monthly file).
- **Retrieved:** 2026-11-09 from <https://raw.githubusercontent.com/datasets/global-temp/main/data/monthly.csv> (datahub.io `global-temp`, republishing NOAA/NASA GCAG).
- **Licence:** the datahub packaging is ODC-PDDL; the underlying figures are public US government data. Kept as a test fixture with its source named.
- **Used by:** `global-temp.test.mjs`, README "Global temperature: a documented 1945 step".

## co2-mauna-loa.csv

- **What:** Mauna Loa monthly atmospheric CO2 (ppm, interpolated column), 1958-03 to 2026-09, 823 values.
- **Retrieved:** 2026-11-09 from <https://raw.githubusercontent.com/datasets/co2-ppm/main/data/co2-mm-mlo.csv> (datahub.io `co2-ppm`, republishing NOAA GML).
- **Licence:** ODC-PDDL packaging; underlying figures are public US government data. Kept as a test fixture with its source named.
- **Used by:** `co2-mauna-loa.test.mjs`, README "Mauna Loa CO2".

## gold.csv

- **What:** daily gold price (US dollars), 1985-01-01 to 1989-03-31, 1108 rows (`day` index, `price`); 34 days are blank.
- **Retrieved:** 2026-11-09 from <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/forecast/gold.csv> (R `forecast::gold`; the `time` and `value` columns).
- **Licence:** Rdatasets republishes the `forecast` package data (GPL-3 package); a price series is a fact, kept as a test fixture with its source named.
- **Used by:** `gold-price.test.mjs`, README "Gold prices".

## sp500-monthly.csv

- **What:** S&P 500 monthly price index level, Jan 2000 to Mar 2010, 123 rows (`date` like `Jan 1 2000`, `price`). Whether each value is a month's open, close or average is not stated by the source and was not checked.
- **Retrieved:** 2026-11-10 from <https://raw.githubusercontent.com/vega/vega-datasets/main/data/sp500.csv> (vega-datasets, BSD-3-Clause repository; a price series is a fact, kept as a test fixture with its source named).
- **Used by:** `sp500-monthly.test.mjs`, `eval/sp500-monthly.mjs`, README "S&P 500 monthly returns".

## Documented dates read from the R documentation (2026-11-11)

Read in full on 2026-11-11: the R documentation pages for `Nile` and `UKDriverDeaths`
(<https://vincentarelbundock.github.io/Rdatasets/doc/datasets/Nile.html> and
`.../UKDriverDeaths.html`). They are not the papers. `Nile`: "with apparent changepoint
near 1898 (Cobb (1978), Table 1, p.249)". `UKDriverDeaths`: "Compulsory wearing of seat
belts was introduced on 31 Jan 1983." Those are the two dates `eval/consensus-real.mjs`
scores; the Cobb and Harvey-Durbin papers themselves are still unread.


# Example data: UK road casualties, seven series, 1969-1984

`uk-road-casualties.csv`: R's `datasets::Seatbelts` (Harvey 1989, pp. 519-523; Harvey and Durbin 1986),
192 months, January 1969 to December 1984. Columns: car drivers killed (`DriversKilled`), car drivers
killed or seriously injured (`drivers`, the same series as `uk-driver-deaths.csv`), front-seat and
rear-seat passengers killed or seriously injured (`front`, `rear`), distance driven (`kms`), petrol
price (`PetrolPrice`) and van drivers killed (`VanKilled`). The source's eighth column, `law` (0/1,
the front-seat belt law in force from 31 January 1983), is left out: it is the answer, not data. The
`month` column is built from the row order of the source. Used to check that the several-column
report prints when the set is wider than one page (`eval/multi-report-print.mjs`).

- **Retrieved:** 2026-11-11 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/Seatbelts.csv>.
- **Licence:** a published table (Harvey 1989); R's `datasets` package is GPL-2 or later. Only
  the numbers are used here.
- **Used by:** `eval/multi-report-print.mjs`, `multi-report.test.mjs`.

## gistemp-annual.csv and gcag-annual-1850.csv

- **What:** annual means of the 12 monthly global temperature anomalies (degrees C), complete years only: `GISTEMP` rows, 1880-2024 (145 values), and `GCAG` rows, 1850-2024 (175 values; its 1880-2024 part equals `global-temp-annual.csv` exactly).
- **Retrieved:** 2026-11-13 from <https://raw.githubusercontent.com/datasets/global-temp/main/data/monthly.csv> (datahub.io `global-temp`, republishing NASA GISTEMP and NOAA/NASA GCAG).
- **Licence:** the datahub packaging is ODC-PDDL; the underlying figures are public US government data. Kept as test fixtures with their source named.
- **Used by:** `hinge-test.test.mjs`, `eval/hinge-test-real.mjs`, README "The 1976 acceleration, dated and tested on the levels".

# Example data: five-minute call volume at a North American bank, 2003

`bank-calls-5min.csv`: one row per weekday, the date then the calls handled in each of 169 five-minute slots from
07:00 to 21:05, 164 weekdays from 2003-03-03 to 2003-10-24 (the `fpp2::calls` series, reshaped from one column).

- **Retrieved:** 2026-11-16 from the Rdatasets mirror,
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/fpp2/calls.csv> (row names such as
  `X3.3.20031`, day.month.year then slot, rewritten as dates).
- **Source:** Rob Hyndman, for *Forecasting: Principles and Practice* (2nd ed.); the package documentation says
  "Five-minute call volume handled on weekdays between 7:00am and 9:05pm, beginning 3 March 2003 for 164 days."
- **Licence:** the fpp2 package is GPL-3; the series is published counts (facts). Not checked further.
- **Used by:** `eval/calls-law.mjs`, `eval/calls-law-posthoc.mjs`, `calls-law.test.mjs`.

# Labelled data: honeybee dance sequences 1-6

`beedance-1.csv` to `beedance-6.csv`: tracked position (x, y) and heading of a
dancing honeybee, one row per video frame (602 to 1124 frames), with `change`
= 1 on each frame the set's own labels mark as the start of a new dance phase
(left turn, right turn, waggle; 15 to 28 per sequence). Columns are min-max
scaled to [0, 1] as distributed (the heading too, so it jumps at the wrap
point). Values rounded to six decimals.

- **Retrieved:** 2026-11-16 from
  <https://github.com/OctoberChang/klcpd_code> (commit `b3a32ee`),
  `data/beedance/beedance-{1..6}.mat` (`Y` frames x 3, `L` labels),
  converted with scipy's `loadmat`.
- **Licence:** the repository is BSD 3-Clause, "Copyright (c) 2019, author of
  KLCPD paper"; redistributed here under its notice, with the original data
  credited to Oh et al.
- **Cite:** Oh, S. M., Rehg, J. M., Balch, T. and Dellaert, F. (2008).
  Learning and inferring motion patterns using parametric segmental switching
  linear dynamic systems. *International Journal of Computer Vision* 77,
  103-124. doi:10.1007/s11263-007-0062-z (not opened from this session: the
  DOI hosts answered 403; the title and venue are as KL-CPD and TCPD cite
  them). Chang, W.-C., Li, C.-L., Yang, Y.
  and Póczos, B. (2019). Kernel change-point detection with auxiliary deep
  generative models. ICLR 2019. arXiv:1901.06077 (as the repository's README cites it).
- **Used by:** `eval/beedance-multi.mjs`, `eval/muted-sim.mjs`,
  `beedance-muted.test.mjs`. Sequence 6 is the dance TCPD calls
  `bee_waggle_6` (seen data); 1 to 5 are fresh.

# US cigarette sales per head and state taxes, 1970-2019 (the tax burden on tobacco)

`us-cigarette-packs-per-capita.csv`: packs of cigarettes sold per head in each of the 50 states and DC, by fiscal
year (Orzechowski and Walker compile state tax-paid sales; the fiscal year ends 30 June in most states), 1970-2019.
`us-cigarette-state-tax.csv`: the state excise tax per pack in dollars, same rows. One column per state (postal code).

- **Retrieved:** 2026-11-17 from the CDC's "The Tax Burden on Tobacco, 1970-2019" dataset,
  <https://data.cdc.gov/api/views/7nwe-3aj9/rows.csv?accessType=DOWNLOAD> (measures "Cigarette Consumption (Pack
  Sales Per Capita)" and "State Tax per pack"), reshaped to one column per state; no values changed.
- **Licence:** Open Data Commons Attribution License 1.0 (the dataset's stated licence on data.cdc.gov).
  Attribution: Centers for Disease Control and Prevention, National Center for Chronic Disease Prevention and Health
  Promotion, Office on Smoking and Health; Orzechowski and Walker, *The Tax Burden on Tobacco*.
- **Cite (the policies tested):** Abadie, A., Diamond, A. and Hainmueller, J. (2010). Synthetic control methods for
  comparative case studies: estimating the effect of California's tobacco control program. *J. Am. Stat. Assoc.*
  105(490), 493-505. doi:10.1198/jasa.2009.ap08746 (California's Proposition 99 and its 38-state donor pool).
- **Used by:** `eval/known-date-control-step-real.mjs`, `known-date-control.test.mjs`, `eval/synth-real.mjs`, `eval/synth-real-diag.mjs`, `synth-control.test.mjs`, `eval/synth-cov-real.mjs`.

`us-cigarette-retail-price.csv`: the average retail price of a pack of cigarettes in each state, in dollars, same
rows and columns (the dataset's measure "Average Cost per pack"), 1970-2019. Same retrieval (2026-11-17), source,
licence and attribution as the two files above; reshaped to one column per state, no values changed.

# US per capita personal income by state, 1970-2019

`us-personal-income-per-capita.csv`: per capita personal income in current dollars, one column per state (postal
code) and DC, calendar years 1970-2019.

- **Retrieved:** 2026-11-17 from the U.S. Bureau of Economic Analysis, Regional Economic Accounts, table SAINC1
  ("Personal income summary"), <https://apps.bea.gov/regional/zip/SAINC.zip>, file
  `SAINC1__ALL_AREAS_1929_2025.csv`, line code 3 ("Per capita personal income (dollars)"); reshaped, no values changed.
- **Licence:** a U.S. federal government work, public domain in the United States. Attribution: U.S. Bureau of
  Economic Analysis.
- **Used by:** `eval/synth-cov-real.mjs` (a covariate of the synthetic control, README "Matched on covariates").

# Proposition 99 covariates for the CLI's synthetic control

`prop99-covariates-1989.csv`: one row per state, the `--covariates` file of README "A synthetic control from the
command line". Derived, not retrieved: written by `node eval/prop99-covariates.mjs` from
`us-personal-income-per-capita.csv`, `us-cigarette-retail-price.csv` and `us-cigarette-packs-per-capita.csv` (ln
income and price averaged over 1980-1988, packs per head in 1975, 1980 and 1988, and the 1970-1988 mean of packs per
head). Same sources, licences and attribution as those files.

# Two few-donor synthetic-control panels: Spanish regions and OECD countries

`spain-regions-gdp-per-capita.csv`: GDP per head in thousands of 1986 USD, one column per Spanish region (short codes:
AND Andalucia, ARA Aragon, AST Asturias, BAL Baleares, BAS Basque Country, CAN Canarias, CNT Cantabria, CYL Castilla
y Leon, CLM Castilla-La Mancha, CAT Cataluna, VAL Comunidad Valenciana, EXT Extremadura, GAL Galicia, MAD Madrid, MUR
Murcia, NAV Navarra, RIO La Rioja), 1955-1997; Spain's national row is dropped. `spain-regions-covariates-1969.csv`:
investment share 1964-69, industry and agriculture shares 1961-69 (odd years only in the source), population density
1969 and GDP per head 1960-69, one row per region (the CLI's `--covariates` format).

`oecd-gdp-per-capita-1960-2003.csv`: GDP per head, PPP, 2002 USD, one column per country (spaces dropped:
WestGermany, NewZealand), 1960-2003. `oecd-covariates-1989.csv`: trade openness, inflation and industry share
averaged 1981-89, schooling 1980 and 1985, investment 1980-84 and GDP per head 1981-89, one row per country.

- **Retrieved:** 2026-11-18 from pysyncon (MIT licence), <https://raw.githubusercontent.com/sdfordham/pysyncon/main/data/basque.csv>
  (sha256 `7f7f90d7a01984a33a2ea3efc311ce826c05b61234a52c27445adacc6f52bf70`) and `.../data/germany.csv` (sha256
  `c59ff635faaf43729eaefdf5e9a4584fc3112a56fdab84b9ac5f78e1b6302e83`): copies of the R Synth package's `basque` data
  and of the replication data of Abadie, Diamond and Hainmueller (2015). Reshaped by `node eval/few-donor-panels.mjs
  basque.csv germany.csv`, no value changed; covariates are plain averages of the source's columns.
- **Cite:** Abadie, A. and Gardeazabal, J. (2003). The economic costs of conflict: a case study of the Basque Country.
  *Am. Econ. Rev.* 93(1), 113-132. doi:10.1257/000282803321455188. Abadie, A., Diamond, A. and Hainmueller, J. (2015).
  Comparative politics and the synthetic control method. *Am. J. Polit. Sci.* 59(2), 495-510. doi:10.1111/ajps.12116.
- **Used by:** `eval/synth-few-donors-real.mjs`, `synth-few-donors.test.mjs` (README "Few donors").

## online-retail-daily.csv

- **Source:** UCI Machine Learning Repository, "Online Retail" (dataset 352), CC BY 4.0: every invoice line of a UK
  online gift retailer, 2010-12-01 to 2011-12-09 (541,909 lines). Fetched 2026-11-18 from the copy in
  databricks/Spark-The-Definitive-Guide, `data/retail-data/all/online-retail-dataset.csv` (sha256 `a2f79bbdd4463df6db8a3f5a50b9c980ae8f645a370bf5e2c0d6097f9e817b05`; the UCI host
  was not reachable from this session).
- **Reshaped** by `python3 eval/real-shop-daily.py online-retail-dataset.csv data/online-retail-daily.csv`: one row per
  calendar day, zeros on days with nothing; `orders` = distinct invoices not starting with C that have a line of
  positive quantity and price, `revenue` = their gross (quantity x unit price, GBP), `cancellations` = distinct C
  invoices, `new_customers` = customer ids on their first day in the file.
- **Cite:** Chen, D., Sain, S. L. and Guo, K. (2012). Data mining for the online retail industry: a case study of RFM
  model-based customer segmentation using data mining. *J. Database Marketing and Customer Strategy Management* 19(3),
  197-208. doi:10.1057/dbm.2012.17.
- **Used by:** `eval/real-shop-suggest.mjs`, `real-shop.test.mjs` (README "A real shop's daily series").

## online-retail-2009-daily.csv

- **Source:** UCI Machine Learning Repository, "Online Retail II" (dataset 502), CC BY 4.0: the same UK online gift
  retailer's invoice lines, sheet "Year 2009-2010", 2009-12-01 to 2010-12-09 (525,461 lines). Fetched 2026-11-19 from
  archive.ics.uci.edu/static/public/502/online+retail+ii.zip (workbook `online_retail_II.xlsx`, sha256
  `bcbe73b35f5b7babf197fb0cb983a11f5d9ff929078d4aa53d171b1f2df2e980`).
- **Reshaped** by `python3 eval/real-shop-xlsx.py online_retail_II.xlsx "Year 2009-2010" online-retail-ii-2009.csv`
  (the sheet as CSV, dates ISO; needs `openpyxl`) and then `python3 eval/real-shop-daily.py online-retail-ii-2009.csv
  data/online-retail-2009-daily.csv`, with the same column rules as `online-retail-daily.csv` above (the script reads
  both files' column names; on the 2010-11 file it still writes `online-retail-daily.csv` byte for byte).
- **Cite:** Chen, D. (2019). Online Retail II. UCI Machine Learning Repository. doi:10.24432/C5CG6D.
- **Used by:** `eval/closed-days.mjs` (output `eval/closed-days.out.txt`, simulation shards `eval/closed-days-sim/`), `closed-days.test.mjs` (README "Closed days filled as missing").

## covid-schedules.csv

- **Source:** Johns Hopkins University CSSE COVID-19 Data Repository, github.com/CSSEGISandData/COVID-19, CC BY 4.0:
  `csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_US.csv` (cumulative confirmed cases per
  county, 2020-01-22 to 2023-03-09; fetched 2026-11-18, sha256 `e8fe5837b1a7ce09e6187ef778bf69fdcfa9fcd7015b1ba597f248b0736d8cf3`).
- **Reshaped** by `readStates` in `eval/update-rate-covid-schedules.mjs`: each state's rows summed per day. Six states
  kept (Minnesota, Utah, Vermont, South Dakota, California, Kentucky), every day.
- **Labels:** the repository README's "Irregular Update Schedules" section, which gives each state's documented
  reporting schedule and the date it changed (e.g. "Minnesota: Providing data once per week (Thursdays) (as of June 30, 2022)").
- **Cite:** Dong, E., Du, H. and Gardner, L. (2020). An interactive web-based dashboard to track COVID-19 in real time.
  *Lancet Infectious Diseases* 20(5), 533-534. doi:10.1016/S1473-3099(20)30120-1.
- **Used by:** `eval/update-rate-covid-schedules.mjs` (full file via `eval/covid-schedules-fetch.sh`),
  `update-rate-covid.test.mjs` (README "A provider's own schedule changes").

# US quarterly activity series and NBER recession dates (fresh labels for the trend-walk route)

`us-macro-quarterly.csv`: the `realgdp`, `realcons`, `realinv`, `realdpi` and `unemp` columns of statsmodels'
`macrodata` dataset, 203 quarters, 1959Q1 to 2009Q3 (`us-unemployment.csv` is the same `unemp` from 1959Q2).

- **Retrieved:** 2026-11-22 from
  <https://raw.githubusercontent.com/statsmodels/statsmodels/main/statsmodels/datasets/macrodata/macrodata.csv>.
- **Licence:** public domain (statsmodels' dataset module, `COPYRIGHT`); the figures are US Bureau of Economic
  Analysis and Bureau of Labor Statistics data via FRED.

`nber-recessions.csv`: the first and last month of each US recession from 1857 to 2020, the 34 rows of `nberDates()`
in the R package tis 1.39 (NBER Business Cycle Dating Committee dates; a peak is the month before `start`, a trough
is `end`).

- **Retrieved:** 2026-11-22 from <https://raw.githubusercontent.com/cran/tis/master/R/nber.R> (the CRAN mirror on
  GitHub; nber.org and fred.stlouisfed.org refused this session).
- **Licence:** tis is released as "Unlimited"; the dates are published facts.
- **Used by:** `eval/trend-walk-nber.mjs`, `trend-walk-nber.test.mjs`.

# US industrial production and persons unemployed (fresh NBER-labelled series for the stiff-slope trend walk)

`us-industrial-production-monthly.csv`: the `production` column (index of industrial production) of AER's
`USMacroSWM` (Stock and Watson), 696 months from 1947-01 to 2004-12 (the package's help says 1947(1) to 2004(4);
696 rows from 1947-01 end in 2004-12, and the 1958-04, 1975-05 and 2001-12 troughs fall on their known months).
`us-industrial-production-quarterly.csv`: the `adjusted` column of AER's `USProdIndex` (Franses 1998; 1985 = 100),
128 quarters from 1960Q1 to 1991Q4 (the 1985 rows average 99.5). `us-unemployed-monthly.csv`: the `unemploy` column
(thousands of persons unemployed, FRED UNEMPLOY) of ggplot2's `economics`, 574 months from 1967-07 to 2015-04.

- **Retrieved:** 2026-11-23 from <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/AER/USMacroSWM.csv>,
  `.../csv/AER/USProdIndex.csv` and `.../csv/ggplot2/economics.csv` (fred.stlouisfed.org refused this session).
- **Licence:** Federal Reserve Board and US Bureau of Labor Statistics figures, US government works in the public
  domain; the Rdatasets copies are as published by AER (GPL-2 | GPL-3) and ggplot2 (MIT). Used as test fixtures only.
- **Used by:** `eval/trend-walk-stiff.mjs`, `eval/trend-walk-stiff-chance.mjs`, `trend-walk-stiff.test.mjs`.

# Iran's non-oil GDP and the MBRI business-cycle dating (a fresh dated cycle for the turning-point test)

`iran-non-oil-gdp-quarterly.csv`: 108 quarters of the Iranian calendar, 1367Q1 to 1393Q4 (about spring 1988 to
winter 2015). `growth_pct` is BCDating's `Iran.non.Oil.GDP.Quarterly.Growth` (quarter-on-quarter growth of
seasonally adjusted, X-12, non-oil GDP, in percent; 107 values from 1367Q2); `level` is the index built from it
(1367Q1 = 100); `hp_cycle` is the package's `Iran.non.Oil.GDP.Cycle` (the HP cycle the dating was read from);
`mbri_state` is the dating's state column (1 expansion, -1 contraction). `mbri-iran-dating.csv`: the 6 peaks and 7
troughs of `MBRI.Iran.Dating`, "the official Dating of Business Cycles of Iran by MBRI" (the Monetary and Banking
Research Institute), as quarters. Check: the log of `level`, HP-filtered with lambda 1600, correlates 0.886 with
`hp_cycle` at lag 0 (0.743 and 0.714 at lags -1 and +1), and 12 of the 13 dated quarters are local extremes of
`hp_cycle` (the 1378Q4 peak is not; the package says the official dating was adjusted on other facts).

- **Retrieved:** 2026-11-23 from <https://raw.githubusercontent.com/cran/BCDating/master/data/> (the three `.rda`
  files, MD5s matching the package's `MD5` file), read with the Python `rdata` package.
- **Source:** Central Bank of the Islamic Republic of Iran; Einian, M. and M. Barakchian (2014), "Measuring and
  Dating Business Cycles of the Economy of Iran", *Journal of Monetary & Banking Research* 7(20), 161-194.
- **Licence:** BCDating is GPL-2; the figures are published national accounts and a published dating. Used as test
  fixtures only.
- **Used by:** `eval/turns-iran.mjs`, `turns-iran.test.mjs`.

# US real GDP, FRED GDPC1, 1947Q1 to 2026Q1 (and two other vintages)

`us-gdpc1.csv`: real gross domestic product, billions of chained 2017 dollars, seasonally adjusted annual rate,
quarterly 1947Q1 to 2026Q1 (317 rows), FRED series `GDPC1` (US Bureau of Economic Analysis).
`us-gdpc1-vintage-2025.csv` (2000Q1 to 2024Q4, 100 rows) and `us-gdpc1-vintage-2026q2.csv` (2000Q1 to 2026Q2,
106 rows) are an earlier and a later vintage of the same series; they differ from the main file from 2020 and
2021 onward (BEA's annual revisions), and are used only for a printed vintage check.

- **Retrieved:** 2026-11-24. fred.stlouisfed.org and apps.bea.gov refused this session's proxy, so the files are
  unmodified FRED downloads (`observation_date,GDPC1`) committed in public GitHub repositories, read at pinned
  commits through raw.githubusercontent.com. The main file is
  `jalonso1979/puremacro@73030cf7:puremacro/datasets/data/GDPC1.csv`; three independent copies
  (`charlescoverdale/nowcast@6b93b60b:paper/data/GDPC1.csv`, `GongJr0/Econometrics2025-Project@128ccac0:data/fred/GDPC1.csv`,
  `mikkelpm/macro_econometrics@6db3b17a:code/data/GDPC1.csv`) agree with it on every shared quarter (316, 141 and
  316 quarters; the last one differs only in 2025Q4, its own later estimate). The vintages are
  `JackDamato/macro-regime-allocation@b76de9c8:MacroData/GDPC1.csv` and
  `Nicholashsw/macro-desk@abd880ea:macro_desk/data/GDPC1.csv`. Quarter labels were made from the date column.
- **Licence:** US government statistics, public domain. Only the numbers were taken.
- **Used by:** `eval/turns-gdpc1.mjs`, `turns-gdpc1.test.mjs`.

# US payroll employment and NBER monthly recession months (the monthly BBQ round)

`us-payems.csv`: all employees, total nonfarm, thousands of persons, seasonally adjusted, monthly 1939-01 to
2026-07 (1,051 rows), FRED series `PAYEMS` (US Bureau of Labor Statistics, Current Employment Statistics).
`us-payems-vintage-2024.csv` (1939-01 to 2024-06) and `us-payems-vintage-2026-10.csv` (1939-01 to 2026-10) are an
older and a newer vintage, used only for a printed vintage check; the older one differs from the main file from
1990 on (BLS's annual benchmark revisions). `us-usrec.csv`: FRED's `USREC`, 1 in NBER recession months
(1854-12 to 2026-06), from which the monthly peaks and troughs are read.

- **Retrieved:** 2026-11-24. fred.stlouisfed.org, bls.gov and nber.org refused this session's proxy, so the
  files are FRED downloads committed in public GitHub repositories, read through raw.githubusercontent.com and
  pinned here by git blob id (the id GitHub's code search reports for that file). Main file:
  `Gariyuuu/forecast-graveyard:data/raw/PAYEMS.csv` (blob d828b52e). Three independent copies,
  `charlescoverdale/nowcast:paper/data/PAYEMS.csv` (81fb7f98), `shergin/malevich:demos/fred/data/payems.csv`
  (c473df11) and `Sir-Teo/explainer-videos:explainer/economics/data/fred_PAYEMS.csv` (33a16a57), agree with it on
  every shared month except each copy's last two (BLS's usual two monthly revisions). The newer vintage is that
  last copy; the older is `ebbam/transition_abm:data/macro_vars/PAYEMS.csv` (59eddc67). USREC is
  `jalonso1979/puremacro:curso/notebooks/data_curso/USREC.csv` (23231f92); two independent copies
  (`atkrish0/regime-shift-forecasting:data/USREC.csv`, `zivmi/voc_reproduction:data/raw/USREC.csv`) give the
  same peaks and troughs from 1980 on. Date columns were cut to `YYYY-MM`; values are unchanged.
- **A slip in `nber-recessions.csv`:** its copy of tis (1.39) starts the 2020 recession in 2020-01, so the peak
  it implies is 2019-12. NBER dated the peak February 2020 (announcement of 8 June 2020) and USREC agrees.
  Every other turn since 1939 agrees. The quarterly rounds are unaffected in their matching (both months fall
  within a quarter of 2019Q4, NBER's quarterly peak); the file is left as the unmodified tis copy and the
  monthly round reads USREC instead.
- **Licence:** US government statistics, public domain. Only the numbers were taken.
- **Used by:** `eval/turns-payems.mjs`, `turns-payems.test.mjs`.

## US coincident indicators (FRED W875RX1, INDPRO, CMRMTSPL, CE16OV)

`us-w875rx1.csv`: real personal income excluding current transfer receipts, billions of chained 2017 dollars,
seasonally adjusted annual rate, monthly 1959-01 to 2026-08 (BEA). `us-indpro.csv`: industrial production index,
2017 = 100, seasonally adjusted, 1919-01 to 2026-09 (Federal Reserve Board). `us-cmrmtspl.csv`: real manufacturing
and trade industries sales, millions of chained 2017 dollars, seasonally adjusted, 1967-01 to 2026-07 (FRED,
from Census and BEA data). `us-ce16ov.csv`: employment level from the household survey, thousands of persons,
seasonally adjusted, 1948-01 to 2026-09 (BLS CPS); 2025-10 is blank, as in FRED (no survey in the October 2025
shutdown).

- **Retrieved:** 2026-11-24. fred.stlouisfed.org refused this session's proxy (as on 2026-11-24 for PAYEMS), so
  the files are FRED downloads committed in a public GitHub repository, read through raw.githubusercontent.com:
  `rasmuspeterk-ctrl/recession:v5/data/raw/2026-10-27/` (W875RX1 blob 17abea62, CMRMTSPL ef8d5017, CE16OV
  4873460e, INDPRO from the same folder). That folder's PAYEMS agrees with `us-payems.csv` on every month but its
  last two. Independent copies: W875RX1 `fartbagxp/economics:data/raw/w875rx1.csv` (643ea041) and
  `anthonythomashall3-rgb/bristow-hall-live:.../fred_latest/W875RX1.csv` (312c2375) agree on all 812 shared months
  but the last two; CMRMTSPL from the second (5491dab7) agrees on 715 months but the last; CE16OV
  `jalonso1979/puremacro:curso/notebooks/data_curso/CE16OV.csv` (3837a112) agrees on all 941; INDPRO
  `bdecon/US-chartbook:chartbook/data/indpro.csv` (9f28b057, 1989 on) is within 0.2% on every month (a different
  vintage of the Fed's annual revisions). An older CMRMTSPL copy (`someshrai/WQU_MScFE_data`, 2014-2020) differs
  by up to 7%: a pre-benchmark vintage, not used. Date columns were cut to `YYYY-MM`; values are unchanged.
- **Licence:** US government statistics, public domain. Only the numbers were taken.
- **Used by:** `eval/turns-composite.mjs`, `turns-composite.test.mjs`.


## FRED-MD vintages: PAYEMS, W875RX1, INDPRO as published, 1999-08 to 2021-10

`fredmd-vintages/PAYEMS.csv`, `W875RX1.csv`, `INDPRO.csv`: every monthly vintage of three FRED-MD series (McCracken
and Ng, "FRED-MD: A Monthly Database for Macroeconomic Research", Federal Reserve Bank of St. Louis), from the
first vintage (1999-08) to 2021-10, each series as that vintage published it from 1959-01 (W875RX1's earliest
vintages from 1967-01). Levels: payroll employment in thousands, real personal income less transfers in billions
of chained dollars (each vintage's own base year), industrial production as an index (each vintage's base year).

- **Retrieved:** 2026-11-24. stlouisfed.org (FRED-MD's home and ALFRED) refused this session's proxy, so the
  vintages are read from AQLT/turningPointsDetection (github.com, commit 40a5d111bfd5f90be0562d449455a3a542f5d806),
  `data/byseries_nber/<SERIES>.RDS` (git blobs PAYEMS ca33eb81, W875RX1 9e2f0a14, INDPRO 1c63fe43), made by that
  repository's `R_fred_nber/0-download_files.R` from FRED-MD's `Historical_FRED-MD.zip` and `FRED_MD.zip`. Those
  files store log levels per vintage, keyed by the last month, keeping the first vintage to reach each month.
  `eval/fredmd-vintages.py` (pip `rdata`, `numpy`) converts them: exp() of every cell is within 1e-6 of a value at
  the source's own precision (whole thousands, one decimal, four decimals), so the levels are recovered exactly.
  The 2021-10 vintage's monthly growth agrees with today's files (`us-payems.csv`, `us-w875rx1.csv`,
  `us-indpro.csv`) within a median 0.006, 0.016 and 0.027 percentage points from 1990 on: later revisions only.
- **Format:** `last,first,from,values`, a row per kept vintage, values from `from` (the first month that differs
  from the row before) to `last`; `eval/fredmd-vintages.mjs` rebuilds each vintage and says which one a user held
  at a given month. One W875RX1 row (to 1999-10) starts at 1992-01 (R's `na.contiguous` after a gap in it).
- **Licence:** US government statistics compiled by the St. Louis Fed; public domain numbers. The source
  repository has no licence file; only the numbers were taken, not its code.
- **Used by:** `eval/turns-vintages.mjs`, `turns-vintages.test.mjs`.
