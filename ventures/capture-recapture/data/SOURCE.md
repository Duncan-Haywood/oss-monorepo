# Example data

## `lily-pond-chorus-frogs.csv`

- **Source:** Muths, E.L., 2020, Demographic data from two chorus frog
  populations in Colorado: U.S. Geological Survey data release,
  <https://doi.org/10.5066/P9BZAPLB> (ScienceBase item
  <https://www.sciencebase.gov/catalog/item/5e46cd65e4b0ff554f66e444>), file
  `Cameron_Lily_cmr_1986-2014.csv`, 2,333 frogs.
- **Licence:** a U.S. Government work, in the public domain in the United
  States. The release's metadata gives "None" for use and access
  constraints. Not affiliated with or endorsed by the USGS.
- **Retrieved:** 2026-11-18. SHA-256 of the raw file:
  `115599d92e3f21a9bbf3f4cde0dde6442c367344483b675ad25b4a902c50ea42`.
- **Reshaped by** `eval/build-example.py RAW.csv > data/lily-pond-chorus-frogs.csv`:
  one row per frog per year it was caught (2,933 rows), with `year`, `id`,
  `sex` and `occasion1`..`occasion5`, the survey days of that breeding season
  in date order; a year with fewer days leaves the later columns blank. The raw
  header has one malformed date, `5/25/2007\6`, which sits between 24-May-06
  and 26-May-06 and is read as 25 May 2006, giving 2006 and 2007 three days each.
- **What it measures:** frogs caught at Lily Pond, Colorado, during breeding;
  2,745 rows are males, 187 females, 1 a juvenile. The original study fitted
  open-population (robust design) models across years; this tool treats each
  season as a separate closed population.

## The cottontail frequencies (in `example-data.mjs`)

Capture frequencies f1..f7 = 43, 16, 8, 6, 0, 2, 1 of 135 cottontail rabbits
penned in a 4-acre enclosure and live-trapped on 18 nights (Edwards, W. R. &
Eberhardt, L. L. (1967), Journal of Wildlife Management 31, 87-96), as printed
in Chao (1987), Biometrics 43, 783-791, section 3.1. Seven counts quoted from
a published paper to reproduce its worked example.
