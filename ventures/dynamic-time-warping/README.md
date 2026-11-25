# Dynamic time warping: align two series in a CSV, and find a pattern in a long one

**How alike are these two series once timing is allowed to stretch, and where
is one ahead of the other?** Paste a table with one series per column (two
seasons, two sensors, two gait cycles, this year's sales curve and last
year's). You get:

- the **DTW distance** (Sakoe & Chiba 1978), per step where the step pattern
  allows it, and how much of the point-for-point difference the warp removes;
- the **alignment path**, drawn over the band, and the two series with matched
  points joined;
- a **lag profile**: for each point of A, how many rows ahead or behind B
  reaches the matched value, with each point read as **timing** (the warp
  closes the gap), **level** (it cannot), **turn** (A sits at a peak or trough,
  so the lag is a hop across it, not a delay) or **no real gap**, and a table
  of the same by stretch of A;
- the **DTW distance between every pair of columns** and each column's nearest;
- **pattern search** (subsequence DTW): put a short pattern in one column and a
  long series in another, and get the best non-overlapping matches, each
  allowed to stretch to twice the pattern's length or squeeze to half.

Live page: https://marisstella.app/dynamic-time-warping/ (runs in the browser;
nothing is uploaded).

```
node cli.mjs data/central-park-tmax-normals.csv --a tmax_1871_1900 --b tmax_1991_2020 --smooth 15   # the example
node cli.mjs runs.csv --a before --b after --window 20 --step asymmetric
node cli.mjs shops.csv --znorm                          # compare shape, not level
node cli.mjs sensor.csv --mode subsequence --a pattern --b signal --matches 10
node cli.mjs runs.csv --csv > path.csv                  # the alignment, one row per path point
node ../../platform/agents/tools.mjs call dynamic-time-warping analyze --input '{"csv":"...","a":"x","b":"y"}'
```

Input is a CSV (comma, tab or semicolon) with a header row, one series per
numeric column and one row per time step. The first text column, such as a
date, names the rows. Blank cells at the ends of a column are dropped (so
columns can differ in length); blank cells inside are filled by straight lines
between neighbours, and counted.

## How it works

**The recursion.** `D(i, j)` is the cheapest alignment of A's first `i` points
with B's first `j`, with `d = |a_i − b_j|` (or its square). Step patterns as
catalogued by Giorgino (2009):

| pattern | recursion | normalised by |
| --- | --- | --- |
| symmetric2 (default) | `min(D(i−1,j−1) + 2d, D(i−1,j) + d, D(i,j−1) + d)` | N + M |
| symmetric1 | `d + min(D(i−1,j−1), D(i−1,j), D(i,j−1))` | none |
| asymmetric | `d + min(D(i−1,j), D(i−1,j−1), D(i−1,j−2))` | N |

**Windows.** The band (Sakoe & Chiba 1978) keeps `|j − i(M−1)/(N−1)| ≤ w`;
by default `w` is 10% of the longer series. The Itakura (1975) window keeps
local slopes between 1/2 and 2, in Giorgino's 0-based form. When more than 5%
of the path runs along the band's edge, the tool says the band may be too
narrow.

**Reading the path.** For point `i` of A the lag is the mean matched row of B
minus the diagonal. The gap is `|a_i − b_i|` at the same row; what is left is
the mean `|a_i − b_j|` over the matched `j`. The point is read as:

- **no real gap** when the gap is under 5% of A's standard deviation;
- **level** when the warp leaves more than half of the gap;
- **turn** when A changes by less than half the gap over ± h rows, or the other
  way from B at the matched point (h = the smoothing half-width, at least
  N/40). Near a peak the same value occurs on both sides, so the warp is free
  to hop across and the lag is not a delay;
- **timing** otherwise.

The path is pinned to both corners, so lags in the first and last few rows are
pulled toward zero.

**Pattern search.** Open-begin, open-end alignment (Tormene et al. 2009) with
the asymmetric pattern: the first row of `D` is free, so one pass over the
long series gives the cheapest alignment of the whole pattern ending at every
point, and a parallel array carries where each one started (Müller 2007,
subsequence DTW). Matches are taken in order of cost, skipping any that
overlaps one already taken; each match's path is recomputed by a closed
alignment over its stretch, which costs the same.

**Preparing series.** Optional centred moving average over ± h rows
(shortened at the ends) and z-normalisation, in that order. The cost table
is N × M; above 25 million cells the tool asks for shorter series.

Implemented from the papers' definitions; no third-party code was ported. The
`PAPERS` export lists what each paper contributed.

## Example: spring now reaches Central Park earlier, and autumn leaves later

The example is the normal daily high at New York Central Park for each
calendar day, averaged over five 30-year periods from 1871-1900 to 1991-2020
(NOAA GHCN-Daily, public domain; `data/SOURCE.md`). Aligning 1871-1900 (A)
with 1991-2020 (B), smoothed ± 15 days, band 37 days, symmetric2:

```
DTW distance 227.542, 0.312 °C per step. Point for point without warping: 1476.798;
warping removes 84.6% of it. Timing at 279 of 365 days, level 62, turn 24.

  from    to      timing lag  timing  turn  level   gap    left
  01-01   01-30            -      0%    0%   100%  1.991   1.9
  01-31   03-01          -23     23%   37%    40%  2.418   0.936
  03-02   04-01        -23.5    100%    0%     0%  3.615   0.042
  04-02   05-01        -14.3    100%    0%     0%  3.129   0.051
  05-02   06-01         -8.4    100%    0%     0%  1.308   0.056
  06-02   07-01         -5.3    100%    0%     0%  0.734   0.045
  07-02   07-31          0.5     53%   43%     3%  1.362   0.05
  08-01   08-31         16.6    100%    0%     0%  1.523   0.038
  09-01   09-30          8.3    100%    0%     0%  1.627   0.07
  10-01   10-31          7.5    100%    0%     0%  1.564   0.051
  11-01   11-30         13.9    100%    0%     0%  2.43    0.047
  12-01   12-31         23.1     39%    0%    61%  2.599   1.458
```

From March to June the recent curve runs ahead: the normal high of early April
1871-1900 now arrives 14 days earlier, and March's 23 days earlier. From
August to November it runs behind: October's old normal now comes about 7.5
days later. Midwinter is a level difference (no shift explains a warmer
January) and July is half turn, so neither is called a delay.

Two checks on that reading:

- **Smoothing.** With no smoothing the April lag is −16.1 days and with ± 7
  days −14.2; October is 7.5 and 7.7 (`engine.test.mjs` pins April to −13 to
  −17 days at each).
- **A back-of-envelope estimate.** If the curve simply moved up by the gap,
  the shift in days would be gap ÷ slope. Over April the mean gap is 3.13 °C
  and the 1871-1900 curve rises 0.263 °C a day, giving 11.9 days against
  DTW's 14.3; over October 1.56 °C ÷ 0.216 °C a day gives 7.2 against 7.5. The
  warp agrees in sign and size with the linear estimate and does not need the
  slope to be constant.

The distance matrix puts 1871-1900 nearest 1901-1930 (0.086 per step) and
1991-2020 nearest 1931-1960 (0.074), closer than 1961-1990 (0.14): the
mid-century normals were warmer than the 1961-1990 ones at this station.

This is the station's record as kept, which spans urban growth around the park
and changes of instrument and site since the 1870s, so it measures how the
park's thermometer changed, not climate change alone.

## Verification

- **Against dtw-python 1.9.0** (Giorgino's package; `eval/reference.py`
  writes `eval/reference.json`): 120 alignments covering the three step
  patterns, no window, bands of 3 and 6 and the Itakura window, absolute and
  squared differences, and five shapes from 12 × 12 to 33 × 50. Distances and
  normalised distances agree to 1e-9 relative and **every path is identical**.
  Six open-begin, open-end searches agree on the distance and on the start and
  end of the best match. dtw-python was used only to produce these numbers.
- **Brute force:** on 20 random pairs up to 5 × 5, the minimum over every
  monotone path equals the DTW distance for symmetric1 and symmetric2.
- **Properties:** paths start and end at the corners, use only the pattern's
  moves and stay in the window; recomputing a path's cost gives the distance;
  the two-row version used for the matrix agrees with the full one; a series
  has distance 0 to itself; symmetric patterns are symmetric; DTW never
  exceeds the no-warping cost, and a band of 0 equals it; a wider band never
  raises the distance.
- **Planted signals:** a sine delayed by 5 steps reads as timing with lag 5 ± 1
  away from the ends, with its peak flagged as a turn; a series shifted up by
  3 reads as level; a pattern planted twice, once at double length, is found
  at both places.
- `page.test.mjs` checks that the numbers in the page's example paragraph are
  the engine's.

Run: `node --test engine.test.mjs cli.test.mjs page.test.mjs usage.test.mjs`
(34 tests, under a second). The example (365 × 365, plus the 5-column matrix) runs
in about 11 ms in Node.

## Not modelled

- **One value per row.** Multivariate DTW (several columns per time step) is
  not offered yet.
- **No significance test.** A DTW distance has no p-value here; compare it with
  the distance matrix or with series you know to be alike.
- **Averaging.** There is no DTW barycentre (DBA) of several series.
- **Lower bounds.** Pattern search scans every end point; there is no
  LB_Keogh pruning, so very long series are limited by the 25-million-cell cap.

## Files

| File | What |
| --- | --- |
| `engine.mjs` | DTW, windows, pattern search, lag profile, CSV reading, `analyze()` |
| `cli.mjs` | The command line |
| `index.html` | The page |
| `example-data.mjs`, `data/` | The Central Park example and its source |
| `eval/` | Reference generator and output (dtw-python), example extractor |
| `*.test.mjs` | Tests |
| `usage.mjs` | On-device feature counts, off with Do Not Track or the switch |

## Disclaimer

**No warranty.** Free and as-is, FSL-1.1-MIT licence. Statistical output from the data
you supply, not legal, tax, financial, medical or professional advice; a lag
or a distance is not proof of a cause. Data never leave the browser.
