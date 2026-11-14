# Data source

## `central-park-july.csv` (the page's example)

- **What it is:** every July day in two climate-normal periods, 1951-1980
  and 1991-2020 (930 days each), at New York Central Park, with the day's
  maximum (`tmax_c`) and minimum (`tmin_c`) air temperature in degrees
  Celsius and the period it belongs to. No July day in those years lacked
  either value or carried a quality flag, so nothing was dropped.
- **Dataset:** Global Historical Climatology Network - Daily (GHCN-Daily),
  station USW00094728, NY CITY CENTRAL PARK, NY US. Menne, M.J., I. Durre,
  B. Korzeniewski, S. McNeill, K. Thomas, X. Yin, S. Anthony, R. Ray,
  R.S. Vose, B.E. Gleason, and T.G. Houston (2012): Global Historical
  Climatology Network - Daily (GHCN-Daily), Version 3. NOAA National
  Centers for Environmental Information. doi:10.7289/V5D21VHZ
- **Downloaded from:**
  https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00094728.csv
  by this repository's session through its network proxy on **2026-11-14**.
- **Licence:** a work of the US Government (NOAA), in the public domain in
  the United States; NCEI places no restrictions on its use.
- **Processing:** kept rows dated July of 1951-1980 or 1991-2020; took
  `TMAX` and `TMIN` (tenths of a degree C in the source) and divided by 10;
  dropped rows with a missing value or a non-blank quality flag (none in
  this selection). `eval/extract_example.py` rebuilds the file from the
  station download byte for byte.
- **A quirk worth knowing:** the station reports whole degrees Fahrenheit,
  so the Celsius values sit on a grid 5/9 of a degree apart (27.2, 27.8,
  28.3, ...). Quantile shifts therefore come in steps of about 0.6 C, and many
  days tie. The distances are exact for the data as recorded.
