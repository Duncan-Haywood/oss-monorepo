# Data sources

Both files are copied byte for byte from `ventures/changepoint-detector/data/`,
where they were first retrieved; that file's `SOURCE.md` has the full record.

## `nile.csv` (the page's first example, and a verification dataset)

Annual flow of the Nile at Aswan, 1871-1970, in 10^8 cubic metres (100 values).
The textbook local level example of Durbin & Koopman (2012, chapter 2), first
analysed for a change by Cobb (1978).

- **Retrieved:** 2026-10-20 from
  <https://raw.githubusercontent.com/statsmodels/statsmodels/main/statsmodels/datasets/nile/nile.csv>
  (the same values as R's `datasets::Nile`).
- **Licence:** public domain. statsmodels' dataset module says "This is public
  domain." (`statsmodels/datasets/nile/data.py`, `COPYRIGHT`).
- **Cite:** Cobb, G. W. (1978). The problem of the Nile: conditional solution to
  a changepoint problem. *Biometrika* 65(2), 243-251. doi:10.1093/biomet/65.2.243.
- SHA-256 of the copy here: `88e97bea7249e5832a85e41aec6ce4b8f7b1b14aae930c8363da7f193286b598`.

## `uk-driver-deaths.csv` (the page's second example, and a verification dataset)

Monthly car drivers in Great Britain killed or seriously injured, January 1969
to December 1984 (192 values; R's `datasets::UKDriverDeaths`). The `month`
column is built from the source's row order.

- **Retrieved:** 2026-10-26 from
  <https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/UKDriverDeaths.csv>.
- **Licence:** a published count series (Harvey & Durbin 1986). R's `datasets`
  package is GPL-2 or later; only the 192 numbers, which are facts, are used here.
- **Cite (the documented break):** Harvey, A. C. & Durbin, J. (1986). The
  effects of seat belt legislation on British road casualties: a case study in
  structural time series modelling. *Journal of the Royal Statistical Society
  A* 149(3), 187-227. The front-seat belt law took effect on 31 January 1983.
- SHA-256 of the copy here: `2aada4ecf9159896e950abe26d207614682a90c99c51148db9047fde0ddc257b`.

`../example-data.mjs` embeds both files verbatim so the static page can load
them; `page.test.mjs` checks they are identical.
