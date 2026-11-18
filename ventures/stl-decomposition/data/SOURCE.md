# Example dataset: Mauna Loa monthly mean CO2 (NOAA GML)

`mauna-loa-co2-monthly.csv` holds 629 monthly means, May 1974 to September
2026, of atmospheric CO2 (ppm) measured at Mauna Loa Observatory, Hawaii.

- **Source:** NOAA Global Monitoring Laboratory, file `co2_mm_mlo.csv`
  from https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv
  (page: https://gml.noaa.gov/ccgg/trends/). The file says "File Creation:
  Fri Oct 9 13:08:07 2026".
- **Retrieved:** 2026-11-13, by this repository's session, through its
  network proxy.
- **Licence and terms:** the file states that "These data are made freely
  available to the public and the scientific community" and asks users to
  credit NOAA GML. NOAA data are a work of the US federal government. We
  credit NOAA GML here, on the page and in the README.
- **What was kept:** columns `year`, `month` (joined as `month`, `YYYY-MM`),
  `average` (renamed `co2_ppm`) and `deseasonalized` (renamed
  `noaa_deseasonalized_ppm`). Nothing else was changed.
- **What was left out:** March 1958 to April 1974. The file says those months
  come from C. David Keeling of the Scripps Institution of Oceanography; we
  kept to the months NOAA measured itself so the example's terms are NOAA's
  alone.
- **Caveats the file states:** missing months are interpolated by NOAA;
  measurements were suspended after the Mauna Loa eruption on 2022-11-29 and
  December 2022 to early July 2023 come from a site on Maunakea, about 21
  miles north.

The `noaa_deseasonalized_ppm` column is NOAA's own seasonal adjustment, made
by a different method (not STL). The tool's tests compare STL's seasonally
adjusted series with it: on this file they differ by 0.075 ppm on average
and 0.38 ppm at most (engine.test.mjs).

# Example dataset: hourly electric load, AEP zone of PJM, spring 2017

`aep-hourly-load-2017.csv` holds 2,016 hourly loads (MW), twelve whole weeks
from Monday 2017-04-03 00:00 to Sunday 2017-06-25 23:00, of the American
Electric Power zone in PJM. It is the example for several seasonal periods at
once (a day of 24 hours and a week of 168).

- **Source:** PJM Interconnection publishes hourly zonal load through Data
  Miner 2. This copy is cut from the widely mirrored Kaggle "Hourly Energy
  Consumption" extract (Rob Mulla, CC0), already in this repository at
  `research/infra-dcopf/data/AEP_hourly.csv` (its `data/README.md` records the
  mirror and commit).
- **Licence:** CC0 (public-domain dedication of the extract).
- **What was kept:** the timestamp (as `YYYY-MM-DD HH:00`) and the load, for
  the twelve weeks above, sorted by time. The span was chosen to sit between
  the two daylight-saving changes, so every hour appears exactly once (the
  extract duplicates or skips an hour at each change).

# Example dataset: US daily births, 1978-1988

`us-births-daily.csv` holds 4,018 daily counts of births in the United States
(both sexes summed), 1978-01-01 to 1988-12-31: a weekly cycle (fewer births
at weekends) and a yearly one.

- **Source:** CDC / NCHS birth counts, as tabulated in
  <https://raw.githubusercontent.com/jakevdp/PythonDataScienceHandbook/master/notebooks/data/births.csv>,
  already in this repository at `ventures/changepoint-detector/data/us-births-daily.csv`
  (its `SOURCE.md` records the retrieval, 2026-11-04).
- **Licence:** US government statistics, public domain.
- **What was kept:** `date` and `births`; that copy's `holiday` column was
  dropped.
