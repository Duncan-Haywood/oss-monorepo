# Moran's I calculator: spatial autocorrelation, LISA clusters and Gi* hot spots

**Are high values next to high values?** Paste one row per place (a county, a
store, a sample site) with its coordinates or a list of which areas share a
border, plus the values, and this tool says whether the map is clustered,
dispersed or random, where the clusters and outliers are, and where the hot
and cold spots are. It is a free, no-install alternative to running GeoDa,
PySAL or ArcGIS's Hot Spot Analysis for a quick, checked answer.

**Live:** https://marisstella.app/spatial-autocorrelation/ (runs in your browser; nothing is uploaded)

## What it computes

| Question | Statistic |
| --- | --- |
| Is the variable clustered overall? | Global **Moran's I** (Moran 1950) with its expected value and variances under normality and randomisation (Cliff & Ord 1981), z-scores, two-sided p-values and a two-sided permutation p |
| Same, from differences between neighbours | **Geary's C** (Geary 1954), same inference |
| Do the *high* values cluster more than the low ones? | Getis-Ord **General G** (Getis & Ord 1992), binary weights, non-negative values |
| Where are the clusters and outliers? | **Local Moran's I / LISA** (Anselin 1995): high-high, low-low, high-low, low-high, conditional-permutation p, analytic conditional z (Sokal, Oden & Thomson 1998), optional Benjamini-Hochberg cut-off |
| Where are the hot and cold spots? | **Getis-Ord Gi\*** (Ord & Getis 1995), 90/95/99% bins |
| How far does the pattern reach? | Moran **correlogram** over distance rings |

Weights: k nearest neighbours (default 6), everything within a distance band,
inverse distance (any power) within a band, or a pasted neighbour list;
row-standardised (default), binary or raw. Longitude/latitude distances are
great-circle kilometres. Every numeric column is analysed, so a table with one
column per year gives a Moran's I time series.

## Use it

- **Browser:** paste a CSV or open a file. "Load example" runs the 48 states'
  per-capita income for all 81 years from 1929 to 2009.
- **Command line** (Node 18+, no install):
  ```sh
  node cli.mjs data/us-state-income.csv --neighbors data/us-state-neighbors.csv --var pci2009 --fdr
  node cli.mjs stores.csv --weights knn --k 8 --json
  ```
- **AI agents:** `node platform/agents/tools.mjs call spatial-autocorrelation analyze --input '{"text":"..."}'`
  or the repository's MCP server.

## Two choices that differ from PySAL and GeoDa

1. **Permutation p-values are two-sided.** esda and GeoDa report a folded
   pseudo p, the share of permutations at least as extreme *in the direction
   the statistic fell*. That is one-sided, and in `eval/calibration-output.txt`
   testing it at 0.05 rejected a true null 9.1% to 12.0% of the time across
   four set-ups; twice it (what this tool reports as `p_sim`) rejected 3.8% to
   6.1%. The one-sided value is kept as `p_sim_one`.
2. **The false-discovery-rate option raises the permutations it needs.** With
   999 permutations the smallest two-sided p is 0.002, above the first
   Benjamini-Hochberg step for 48 places (0.05/48 = 0.00104), so nothing could
   ever pass. With `fdr` on, local Moran uses at least 2n/α permutations and
   says so.

Without any correction, a pattern-free map of 48 states showed at least one
"significant" local cluster in 88.7% to 89.8% of simulated maps, and a map of
120 points in 99.0%; with the FDR cut-off, 4.5% to 9.0%.

## Example: US state incomes, 1929 to 2009

Moran's I of per-capita income on shared borders is significant in all 81
years, peaks at 0.667 in 1934, falls to 0.248 in 1981 and is 0.429 in 2009
(z = 4.65). In 2009, Connecticut, Delaware, Massachusetts, New York and Rhode
Island form a high-high cluster, Tennessee a low-low one and Vermont is a
low-high outlier under every one of 50 seeds; with the FDR cut-off only New
York and Rhode Island remain. Data: BEA via PySAL's `us_income` example
(`data/SOURCE.md`).

## Verification

- `reference.test.mjs`: against PySAL (esda 2.9.0, libpysal 4.14.1) on nine
  cases whose weights libpysal built itself (queen contiguity, great-circle
  KNN with k = 4 and 8, distance band, inverse distance with powers 1 and 2,
  libpysal's own KNN; transforms R, B, O). S0, S1, S2, I, C, G, all variances,
  z and analytic p, every local I, quadrant, conditional mean and variance and
  Gi* z agree to 1e-9. Permutation p-values agree within noise (different
  random streams).
- **One documented difference:** esda's `G_Local` divides by the sum of the
  values and squares the mean in its variance, so its Gi* z flips sign when the
  values sum to a negative number. Ord & Getis's standardised form, used here,
  does not. The test checks that case explicitly.
- `engine.test.mjs`: the numbers the page quotes, scale invariance, a
  checkerboard with I = -1, asymmetric KNN weight sums by hand, haversine,
  neighbour-list parsing and errors.
- `eval/calibration.mjs`: the false-positive rates above.
- `page.test.mjs`: disclaimer, no network calls, labels, FAQ/JSON-LD match, and
  every number on the page against the engine and the calibration output.

Run: `node --test *.test.mjs` (about 5 s).

## Limits

One variable at a time (no bivariate Moran or spatial regression), no
empirical-Bayes rate smoothing (rates from small populations look like
outliers), at most 5,000 places (every pair is compared), and the map is a
dot map of the coordinates, not polygons.

## Citations

Moran (1950) Biometrika 37:17-23, doi:10.2307/2332142. Geary (1954) The
Incorporated Statistician 5:115-145, doi:10.2307/2986645. Cliff & Ord (1981)
Spatial Processes, Pion. Getis & Ord (1992) Geographical Analysis 24:189-206,
doi:10.1111/j.1538-4632.1992.tb00261.x. Ord & Getis (1995) Geographical
Analysis 27:286-306, doi:10.1111/j.1538-4632.1995.tb00912.x. Anselin (1995)
Geographical Analysis 27:93-115, doi:10.1111/j.1538-4632.1995.tb00338.x.
Sokal, Oden & Thomson (1998) Geographical Analysis 30:331-354,
doi:10.1111/j.1538-4632.1998.tb00406.x. Benjamini & Hochberg (1995) JRSS B
57:289-300, doi:10.1111/j.2517-6161.1995.tb02031.x. Rey & Montouri (1999)
Regional Studies 33:143-156, doi:10.1080/00343409950122945.

Implemented from the papers; the moment formulas were checked against esda's
documented conventions, and no code was ported. Not affiliated with the
authors, PySAL, GeoDa, Esri or the BEA.

## No warranty

Free and as-is, MIT licensed. It describes the pattern in the numbers you
give; a cluster is not a cause. Not legal, tax, financial, public-health,
planning or other professional advice.
