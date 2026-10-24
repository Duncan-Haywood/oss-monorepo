# Example data source

## `co2_mm_mlo.csv`: Mauna Loa monthly mean CO2

- **What:** monthly mean atmospheric CO2 mole fraction (ppm, dry air) at Mauna Loa
  Observatory, Hawaii, March 1958 to September 2026 (823 months). The tool uses the
  `average` column; `example-data.mjs` is generated from this file by
  `data/build-example.mjs` and holds those 823 values with `year-month` labels.
- **URL:** https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv
  (described at https://gml.noaa.gov/ccgg/trends/data.html)
- **Retrieved:** 2026-10-20, with `curl`. The file's header says "File Creation: Fri Oct 9 13:08:07 2026".
  Stored unmodified. SHA-256 at retrieval:
  `d895fb5b4a59fb5e4cd98e69b7667fe5bef595c6581f630852b12cb41c07f675`
- **Publisher:** NOAA Global Monitoring Laboratory (GML), Boulder, Colorado.
- **Licence:** a work of the US Government (NOAA), so in the public domain in the
  United States. The file's own header states: "These data are made freely available
  to the public and the scientific community ... To ensure that GML receives fair
  credit for their work please include relevant citation text in publications."
  Values from March 1958 to April 1974 were obtained by C. David Keeling of the
  Scripps Institution of Oceanography and are distributed by NOAA in this same file;
  we redistribute NOAA's file unchanged and credit Scripps as NOAA asks.
- **Citation, as NOAA asks ("How to reference content from this page"):**
  Dr. Xin Lan, NOAA/GML (gml.noaa.gov/ccgg/trends/) and Dr. Ralph Keeling, Scripps
  Institution of Oceanography (scrippsco2.ucsd.edu/).
- **Notes from the file header that matter for reading results:** missing months
  have been interpolated by NOAA (marked by negative `sdev`/`unc`; the tool does not
  treat them differently). Measurements from December 2022 to July 4, 2023 come from
  Maunakea Observatories, about 21 miles north, because the Mauna Loa eruption
  suspended measurements at Mauna Loa from November 29, 2022.

The page, the README and `example-data.mjs` all carry this credit. No other data
is shipped. The test reference `fixtures/stumpy-reference.json` contains this same
series plus two series generated from a seeded random-number generator; see
`fixtures/make_stumpy_reference.py`.
