# Example data

## `us-state-income.csv` and `us-state-neighbors.csv` (the page's example and a verification dataset)

- **What:** per-capita personal income (current dollars) of the 48 contiguous
  US states for every year from 1929 to 2009 (columns `pci1929` ... `pci2009`),
  with each state's centroid (`lon`, `lat`, degrees) and its two-letter
  abbreviation; and, in the second file, each state's neighbours by shared
  border or corner (queen contiguity), 214 directed links.
- **Original source:** U.S. Department of Commerce, Bureau of Economic
  Analysis, Regional Economic Information System (state per-capita personal
  income). A work of the US federal government, so in the public domain in the
  United States.
- **How it got here:** the `us_income` example that ships inside the libpysal
  4.14.1 Python package (PySAL, BSD-3-Clause), installed from PyPI on
  2026-11-18 because this session's network proxy refused the Census and BLS
  hosts. Files used, with SHA-256:
  - `usjoin.csv` `01566698b83366c27193ba6cc9d844f92d7c0a1a5dd4b9348aa46935dc9160d8` (the incomes)
  - `us48.shp` `041a6f67137b217a048238a8c2d6badfc3dcebfde4f98cbd923b409e25e30a28` (state outlines)
  - `states48.gal` `08ee593424c543ac39a1279374d37eef4819625ca953771ecd9d16db505d3b9f` (contiguity)
- **What was changed:** `eval/build-example.py` keeps every income unchanged,
  renames the year columns `pciYYYY`, adds the planar centroid of each state's
  outline in us48.shp (degrees, 4 decimals) and its abbreviation from us48.dbf,
  and writes the neighbours as names. The neighbours are computed by
  libpysal's queen contiguity from us48.shp, and the script asserts they equal
  the bundled `states48.gal` exactly (that file is in `usjoin.csv`'s
  alphabetical order, not the shapefile's).
- **Credit:** the PySAL developers for packaging the series (Rey and
  Montouri 1999 analysed it); not affiliated.
