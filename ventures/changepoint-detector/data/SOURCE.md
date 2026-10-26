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
