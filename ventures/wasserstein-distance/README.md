# Wasserstein distance: earth mover's distance between two groups in a CSV

**How far apart are these two distributions, in my units, and where did the
mass move?** Paste a table with a column naming each row's group (before and
after, this year and last, site A and site B, control and variant) and one or
more numeric columns. You get:

- per column, **exactly**: the Wasserstein distances **W1** (the earth
  mover's distance) and **W2** in the column's own units; W1 split into
  **mass moved up** and **mass moved down** (their sum is W1, their
  difference the mean shift); W2² split into **location**, **spread** and
  **shape**; the shift at seven quantiles; and a **permutation p-value**
  for W1;
- across several columns at once: the **optimal transport** distance (W1 or
  W2) from Sinkhorn's algorithm (Cuturi 2013), reported as a **certified
  range** that the exact, unregularised distance is guaranteed to lie in; the
  share of the movement in each column; a map of where each row's mass goes;
  and the **energy distance** permutation test (Székely & Rizzo 2013);
- the two cumulative distributions with the W1 area shaded, and a CSV of the
  per-column table.

Live page: https://marisstella.app/wasserstein-distance/ (runs in the browser;
nothing is uploaded).

```
node cli.mjs data/central-park-july.csv --scale none            # the example
node cli.mjs runs.csv --group variant --groups control,new      # choose the pair; first is the baseline
node cli.mjs runs.csv --columns latency_ms,payload_kb --cost sqeuclidean
node cli.mjs runs.csv --blur 0.005                              # tighter certified range, slower
node cli.mjs runs.csv --csv > shift.csv                         # the per-column table
node ../../platform/agents/tools.mjs call wasserstein-distance analyze --input '{"csv":"...","group":"period"}'
```

Input is a CSV (comma, tab or semicolon) with a header row. The group column
is guessed (a text column with 2 to 12 values) unless named; the two groups
compared are the first two values seen unless named. Every other numeric
column is compared unless `--columns` names some. Rows missing a chosen value
are left out and counted.

## How it works

**One column.** On the line, `W_p^p = ∫₀¹ |F⁻¹(t) − G⁻¹(t)|^p dt` (Peyré &
Cuturi 2019). Both weighted step quantile functions are walked together, so
W1 and W2 are exact. The parts of the W1 integral where B's quantile is above
A's are "moved up", the rest "moved down". The W2² split is the identity
`W2² = (μ_B − μ_A)² + (σ_A − σ_B)² + 2σ_Aσ_B(1 − ρ)` with population moments
and ρ the correlation of the quantile functions (algebra, checked by a
property test). The permutation test shuffles the pooled labels; for equal
weights W1 is `∫|F_A − F_B|`, so each shuffle is one O(N) sweep over the
pooled sorted values.

**Several columns.** Cost `C_ij` is the Euclidean distance between row i of A
and row j of B (or its square), after dividing each column by its pooled SD
unless `--scale none`. Sinkhorn's algorithm (Cuturi 2013) solves the
entropy-regularised problem with `eps = blur × mean(C)`. It runs on
log-domain potentials `f, g` with the kernel rebuilt around them,
`K_ij = a_i b_j exp((f_i + g_j − C_ij)/eps)`, and scaling vectors near 1
that are absorbed back into `f, g` when they drift; eps starts at `max(C)` and
halves to the target with 50 iterations per stage. Iterations stop when the
column marginal's L1 error is below 1e-4. Then the answer is **certified**:

- **upper bound**: Altschuler, Weed & Rigollet's (2017) ROUND makes the plan
  exactly feasible; any feasible plan's cost is at least the optimum;
- **lower bound**: `f_i = min_j (C_ij − g_j)`, then `g_j = min_i (C_ij − f_i)`
  is a feasible dual pair, so `Σ a_i f_i + Σ b_j g_j` is at most the optimum
  (weak duality; Peyré & Cuturi 2019).

The distance shown is the rounded plan's (the upper end). The per-column share
of movement is each column's part of `Σ P_ij |x_i − y_j|²` under that plan,
and each row's arrow ends at its barycentric image `Σ_j P_ij y_j / a_i`.
Above 1,200 rows per group the several-column problems use a seeded random
subsample (the cost matrix is A × B). Implemented from the papers'
mathematics; no third-party code was ported. The `PAPERS` export lists what
was implemented and every deviation.

## Example: Central Park's July nights warmed, its July days did not

The example is every July day of 1951-1980 and of 1991-2020 at New York
Central Park, daily maximum and minimum temperature (NOAA GHCN-Daily, public
domain; `data/SOURCE.md`). With `--scale none` (both columns are °C):

| Column | W1 (°C) | Mean shift | Moved up | Moved down | W2 | W2² mostly | p (W1, 999 shuffles) |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| `tmin_c` (night low) | 0.789 | +0.789 | 0.789 | 0 | 0.845 | location (87%) | 0.001 |
| `tmax_c` (day high) | 0.208 | −0.07 | 0.069 | 0.139 | 0.387 | shape (96%) | 0.445 |

Every quantile of the night low is higher in 1991-2020 (shifts of +0.6 to
+1.2 °C from the 5th to the 95th percentile), so W1 equals the mean shift:
the whole distribution moved up. The day high barely moved: its 5th and 25th
percentiles are 0.6 °C lower, the rest unchanged, and the difference is within
chance. Both columns at once (W1, no scaling): the certified range is 0.843 to
0.891 °C at the default blur; POT's exact network simplex gives 0.8747; 84% of
the plan's squared movement is in the night low; energy test p = 0.005 (199
shuffles). Consecutive July days are correlated, so the p-values are rougher
than the shuffle count suggests; the station records whole °F, so shifts move
in steps of 5/9 °C.

How the blur trades the width of the certified range for time on the example
(W1, no scaling, this repository's cloud container, Node 22):

| Blur | Range (°C) | Width | Iterations | Time |
| ---: | --- | ---: | ---: | ---: |
| 0.02 | 0.802 to 0.915 | 0.113 | 880 | 2.4 s |
| 0.01 (default) | 0.843 to 0.891 | 0.048 | 1,720 | 4.7 s |
| 0.005 | 0.862 to 0.882 | 0.021 | 3,360 | 7.5 s |

## Verification

`eval/reference.py` (POT 0.9.7, SciPy 1.17.1, NumPy 2.4.6) writes
`eval/reference.json`; `engine.test.mjs` checks against it:

- **W1 and W2 on the line**: six seeded cases, half with weights, unequal
  sizes, against `scipy.stats.wasserstein_distance` and
  `ot.wasserstein_1d(p=2)`: agree to 1e-12. The example's columns too.
- **Sinkhorn plan**: four seeded 2-D problems (30 × 45 and 40 × 25 points,
  Euclidean and squared costs) at eps 0.5 and 0.05, against
  `ot.sinkhorn(method="sinkhorn_log")`: every entry of the plan within 1e-10,
  the Sinkhorn cost within 1e-9.
- **Certified range**: contains `ot.emd2`'s exact cost (network simplex) on
  all those problems at blur 0.1, 0.02 and 0.005, and on the example for W1
  unscaled and W2 SD-scaled; contains the brute-force best assignment over
  all 720 permutations on five 6 × 6 problems.
- **Energy distance**: equals the square of `scipy.stats.energy_distance` in
  one dimension (1e-10) and a direct NumPy computation on the example's
  scaled columns.
- Property tests: rounding gives exact marginals; the dual bound never exceeds
  a feasible plan; a pure shift gives W1 = W2 = the shift; up − down = mean
  shift; the W2² parts add up; the O(N) permutation sweep equals the
  quantile formula; seeded results repeat.

Run: `node --test` in this directory (about 15 s; the example's Sinkhorn
solves dominate).

## Limits

- Distance is not significance, and neither is cause.
- The permutation tests assume exchangeable rows; time series, repeated
  measures and clustered data make the p-values too small.
- Several columns in different units need scaling; with scaling the distance
  is in pooled standard deviations.
- The several-column problems hold an A × B cost matrix in memory, hence the
  1,200-row subsample per group.
- Not modelled: row weights in the page and CLI (the engine's `wasserstein1d`
  takes them), unbalanced transport, the debiased Sinkhorn divergence, more
  than two groups, and time order.

**No warranty.** Statistical output from data you supply, provided as-is. It
is not legal, tax, financial or medical advice and does not replace a
qualified statistician. A distance or a p-value is not proof of a cause.
MIT licence.
