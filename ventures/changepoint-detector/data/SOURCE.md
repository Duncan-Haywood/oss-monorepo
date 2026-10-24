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
