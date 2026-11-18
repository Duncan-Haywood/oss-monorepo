# Example data

Both files are U.S. Geological Survey records for station **USGS 01646500, Potomac River near
Washington, DC, Little Falls Pump Station**, retrieved 2026-11-16 from the National Water
Information System. USGS data are in the public domain (U.S. Government work); the USGS asks
for acknowledgement, given here and on the page. Recent values may be provisional and subject
to revision.

## `potomac-annual-peaks.csv`

Annual peak streamflow (instantaneous), water years 1931-2026, 96 rows.

- Source: `https://nwis.waterdata.usgs.gov/nwis/peak?site_no=01646500&agency_cd=USGS&format=rdb`
- Kept: `peak_dt` (as `peak_date`) and `peak_va` (cubic feet per second, as `peak_cfs`).
  `water_year` is computed from the date: October to September, named by the September year.
- No qualification codes were set on any row except 2021 (`R`, revised); none was dropped.

## `potomac-daily-flow.csv`

Daily mean discharge (parameter 00060, statistic 00003), 2006-10-01 to 2026-09-30: 20 water
years, 7,305 days with no gaps.

- Source: `https://waterservices.usgs.gov/nwis/dv/?format=rdb&sites=01646500&startDT=2006-10-01&endDT=2026-09-30&parameterCd=00060&statCd=00003`
- Kept: date and value (cubic feet per second, as `cfs`). Qualifiers: 7,029 rows `A` (approved),
  112 `A:R` (approved, revised) and 164 `A:e` (approved, estimated).

Daily means are lower than the instantaneous peak on the same day: the largest daily mean of
each water year is 85-96% of that year's instantaneous peak in these records.
