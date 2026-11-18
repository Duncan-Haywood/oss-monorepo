# Data source

## `central-park-tmax-normals.csv` (the page's example)

- **What it is:** for each calendar day (29 February left out), the mean daily
  maximum air temperature in degrees Celsius at New York Central Park over five
  30-year periods: 1871-1900, 1901-1930, 1931-1960, 1961-1990 and 1991-2020.
  Each cell averages the years of that period that have a value for that day.
  Every day of every period has at least 28 years; 21 day-values are missing
  in 1871-1900, 1 in 1901-1930, 4 in 1931-1960 and none after.
- **Dataset:** Global Historical Climatology Network - Daily (GHCN-Daily),
  station USW00094728, NY CITY CENTRAL PARK, NY US. Menne, M.J., I. Durre,
  B. Korzeniewski, S. McNeill, K. Thomas, X. Yin, S. Anthony, R. Ray,
  R.S. Vose, B.E. Gleason, and T.G. Houston (2012): Global Historical
  Climatology Network - Daily (GHCN-Daily), Version 3. NOAA National
  Centers for Environmental Information. doi:10.7289/V5D21VHZ
- **Downloaded from:**
  https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00094728.csv
  by this repository's session through its network proxy on **2026-11-16**
  (17,846,244 bytes).
- **Licence:** a work of the US Government (NOAA), in the public domain in
  the United States; NCEI places no restrictions on its use.
- **Processing:** `eval/extract_example.py` rebuilds the file from the station
  download: it keeps `TMAX` values (tenths of a degree C) whose quality flag is
  blank, averages them per calendar day and period, and divides by 10.
- **What the record is:** the station's series as kept. Over 150 years it
  spans urban growth around the park and changes of instrument and site, so a
  difference between periods is not a pure measure of climate change.
