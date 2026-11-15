# Example data: Potomac River flow at Little Falls

Three files from the U.S. Geological Survey's National Water Information
System (NWIS), for the Potomac River near Washington, DC, at the Little Falls
pump station. Each raw file (USGS RDB format, tab-separated) is kept byte-for-byte unmodified beside the CSV made from it; `.txt` was appended to its name so the site serves it as text.

| CSV | Raw file | What | Rows |
| --- | --- | --- | --- |
| `potomac-monthly-flow.csv` | `usgs-01646500-monthly-mean.rdb.txt` | Gauge 01646500: monthly mean of daily mean discharge, cubic feet per second, 1930-03 to 2026-09 | 1,159 |
| `potomac-annual-peaks.csv` | `usgs-01646500-annual-peaks.rdb.txt` | Gauge 01646500: annual peak discharge, cfs, with its date and USGS qualification code, 1931 to 2026 | 96 |
| `potomac-adjusted-monthly-flow.csv` | `usgs-01646502-monthly-mean-adjusted.rdb.txt` | Record 01646502, "Potomac River, adjusted": the same flow with upstream water-supply withdrawals added back, monthly means, 1930-03 to 2025-08 (some months missing) | 1,142 |

- **Retrieved:** 2026-11-15 by this repository's session, from
  - <https://waterservices.usgs.gov/nwis/stat/?format=rdb&sites=01646500&statReportType=monthly&statTypeCd=mean&parameterCd=00060>
  - <https://nwis.waterdata.usgs.gov/nwis/peak?site_no=01646500&agency_cd=USGS&format=rdb>
  - <https://waterservices.usgs.gov/nwis/stat/?format=rdb&sites=01646502&statReportType=monthly&statTypeCd=mean&parameterCd=00060>
- **SHA-256 of the raw files at retrieval:**
  - `usgs-01646500-monthly-mean.rdb.txt`: `e0d81f40c6ce24a694821277295ff05f37cb6aed9e3d90c809210f63d205c0d6`
  - `usgs-01646500-annual-peaks.rdb.txt`: `c5d66857b1b493c32052bd190918b2c864bbcfd95baf3ae55cac4d87032038e1`
  - `usgs-01646502-monthly-mean-adjusted.rdb.txt`: `dc68c51ee6f1169b6d6407ffd8edfb0fcbe8c7b7a4004fb4fda6d4c7c511b579`
- **What was changed:** the tab-separated `year_nu`, `month_nu`, `mean_va`
  columns became `month` (`YYYY-MM-01`) and `discharge_cfs`; the peak file's
  `peak_dt`, `peak_va` and `peak_cd` became `peak_date`, `peak_cfs` and
  `peak_code` (one peak, 2021, carries `R`, revised). No value was changed.
- **Licence:** USGS data are works of the U.S. federal government and in the
  public domain (USGS, "Copyrights and Credits",
  <https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits>).
  USGS asks that the source be credited, as here. The files carry USGS's own
  notes: statistics are computed from approved daily values and may differ
  from official publications, and recent data may be provisional.
- **Cite the data:** U.S. Geological Survey (2026). National Water Information
  System, USGS Water Data for the Nation, sites 01646500 and 01646502.
  <https://doi.org/10.5066/F7P55KJN>, accessed 2026-11-15.

Why this gauge: it is one of the longest continuous US records near a large
city, and the adjusted record lets the same river be tested with and without
human withdrawals. Neither was chosen for its result; the tool's result on
each is reported in the README whatever it was.
