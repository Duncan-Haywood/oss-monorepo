# Example dataset: Mauna Loa monthly mean CO2, 2010-01 to 2026-09 (NOAA GML)

`mauna-loa-co2-2010-2026.csv` holds 201 monthly means of atmospheric CO2
(ppm) measured at Mauna Loa Observatory, Hawaii.

- **Source:** NOAA Global Monitoring Laboratory, file `co2_mm_mlo.csv` from
  https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv (page:
  https://gml.noaa.gov/ccgg/trends/). The file says "File Creation: Fri Oct
  9 13:08:07 2026".
- **Retrieved:** 2026-11-13, by this repository's session, through its
  network proxy, for `ventures/stl-decomposition/data/` (see its
  `SOURCE.md`). This file is the rows of that copy from 2010-01 onward,
  columns `month` and `co2_ppm` only; no value was changed.
- **Licence and terms:** the NOAA file states that
  "These data are made freely available to the public and the scientific community"
  and asks users to credit NOAA GML. NOAA data are a work of the US federal government. We
  credit NOAA GML here, on the page and in the README.
- **Why 2010 onward:** the fit costs n^3; 201 points keep a seven-kernel
  comparison to about 20 seconds in a browser.
- **Caveats the file states:** missing months are interpolated by NOAA;
  measurements were suspended after the Mauna Loa eruption on 2022-11-29, and
  December 2022 to early July 2023 come from a site on Maunakea, about 21
  miles north.
