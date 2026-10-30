# changepoint-detector: four-index cross-check (2026-10-29)

For the next run on flagship 4. Landed: `data/{smi,cac,ftse}-returns.csv`, `eval/eu-markets.mjs` (+ `.out.txt`, about 6 min),
`eu-markets.test.mjs` (about 4 min, no `--bootstrap`), README section "Four European indices". Result: DAX/SMI cut the
volatility rise at rows 1482/1489, FTSE at 1545-1550, CAC (29% rise) not under `--dispersion`/`--robust`.

Traps: the Rdatasets CSV columns are `rownames,DAX,SMI,CAC,FTSE` (index 1-4); my first script was off by one and overwrote
`dax-returns.csv` (restored from git, values re-derived and matched to 5e-5). The Wikimedia aggregate pageviews API
only starts July 2015 and rate-limits (429) from this container, so the "closure quiet outside it" open item (1) is
still open; the SOPA blackout (Jan 2012) is out of that API's range.
