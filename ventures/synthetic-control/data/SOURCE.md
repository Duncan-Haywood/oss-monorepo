# Example dataset: West German reunification (Abadie, Diamond & Hainmueller 2015)

`germany.csv` is the country-year panel used in:

> Alberto Abadie, Alexis Diamond and Jens Hainmueller (2015). "Comparative
> Politics and the Synthetic Control Method". *American Journal of Political
> Science* 59(2), 495-510. doi:10.1111/ajps.12116

Columns: `code`, `country`, `year` (1960-2003), `gdp` (GDP per capita, PPP,
2002 US dollars), `infrate` (inflation), `trade` (openness), `schooling`,
`invest60`/`invest70`/`invest80` (investment rate), `industry` (industry share
of value added). 17 countries x 44 years = 748 rows plus a header. Many
predictor cells are empty by design (schooling is reported every five years,
investment once per decade); the engine averages over the cells present.

- **Where the file was read:** `data/germany.csv` in the pysyncon repository
  (https://github.com/sdfordham/pysyncon, MIT licence, commit
  `b77dc20e29b012ab03ca1d4caeef7b41861e86f5`), which redistributes the
  authors' replication data for its own parity tests against R's Synth.
- **Not read directly:** the authors' replication archive (Harvard
  Dataverse). This session's network proxy refused dataverse.harvard.edu, so
  the file was not compared byte for byte with the original archive. The
  tool's tests reproduce the paper's donor set (Austria, USA, Japan,
  Switzerland, Netherlands) and pysyncon's R-pinned weights on it.
- **Retrieved:** 2026-11-12.
- **Changes:** none; the file is byte-identical to pysyncon's copy.
- **SHA-256 of `germany.csv`:** `c59ff635faaf43729eaefdf5e9a4584fc3112a56fdab84b9ac5f78e1b6302e83`
- **Licence:** published national-accounts statistics (facts) compiled by
  the authors from OECD and World Bank sources, reproduced with citation as
  pysyncon does under its MIT licence. Cite Abadie, Diamond & Hainmueller
  (2015) when you use them.

The data describe countries, not people.
