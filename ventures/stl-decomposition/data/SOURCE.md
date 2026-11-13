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
