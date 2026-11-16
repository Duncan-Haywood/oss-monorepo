# HDBSCAN clustering: find the groups in a CSV, and the rows in none

**Which groups are in my data, how many are there, and which rows belong to
none of them?** Paste a table (customers and what they buy, specimens and
their measurements, survey scores, sensor readings) and HDBSCAN, the method
of Campello, Moulavi & Sander (2013), finds the groups of rows that sit close
together without being told how many to look for. You get:

- each row's **cluster**, or **noise** when it is in no dense group (it is
  not forced into the nearest cluster, as k-means would);
- each clustered row's **membership** from 0 to 1 (1 at the cluster's
  densest part) and every row's **GLOSH outlier score** from 0 to 1
  (Campello, Moulavi, Zimek & Sander 2015);
- a **profile of each cluster**: size, the columns whose median sets it
  apart, the most typical row, and how each text column (a category, a
  region) splits across it;
- a scatter of the rows coloured by cluster (principal components or any two
  columns) and a CSV of every row's cluster and scores.

Live page: https://marisstella.app/hdbscan-clustering/ (runs in the browser;
nothing is uploaded).

```
node cli.mjs data/penguins.csv                                # the example
node cli.mjs customers.csv --columns visits,spend,basket      # choose the columns
node cli.mjs customers.csv --min-cluster-size 20 --label customer_id
node cli.mjs customers.csv --method leaf --min-samples 5      # more, tighter clusters
node cli.mjs customers.csv --csv > clusters.csv               # every row: cluster, membership, outlier score
node ../../platform/agents/tools.mjs call hdbscan-clustering analyze --input '{"csv":"...","minClusterSize":10}'
```

Input is a CSV (comma, tab or semicolon) with a header row; a headerless
numeric table gets columns `c1`, `c2`, .... Every numeric column is clustered
on unless it looks like an ID or a year (a name such as `id`, `customer_id`
or `year`, or strictly increasing integers) or is a code with three or fewer
integer values. Text columns are never clustered on; columns with up to 12
distinct values are shown as each cluster's make-up. Rows with a missing
value in a chosen column are left out and reported (density has no sensible
fill). Columns are turned into z-scores by default (`--scale robust` uses the
median and interquartile range; `none` keeps raw units). From code,
`hdbscan(X, opts)` runs the method on an already scaled matrix.

## How it works

1. **Core distance** of each row: the Euclidean distance to its
   `min_samples`-th nearest row, counting the row itself (scikit-learn's
   convention; `min_samples` defaults to `min_cluster_size`).
2. **Mutual reachability** `max(core(a), core(b), d(a, b))`, and its minimum
   spanning tree by Prim's algorithm on the complete graph (O(n²) time, O(n)
   memory; nothing n × n is stored).
3. The tree's edges sorted by weight (stably) give the **single-linkage
   hierarchy**; `λ = 1 / distance` is the density level.
4. **Condensing** with `min_cluster_size`: a split is a real split only when
   both sides have at least that many rows; otherwise the smaller side's rows
   fall out of the cluster at that λ.
5. **Stability** of a cluster `Σ (λ_leave − λ_birth)` over its rows, and
   **excess-of-mass** selection: a cluster is kept unless its children are
   together more stable (the root, all rows, is never kept unless
   `--allow-single-cluster`). `--method leaf` keeps the leaves instead.
6. **Labels** (rows outside every kept cluster are noise), **membership**
   `λ_row / λ_max` over the cluster's direct children, and **GLOSH**
   `1 − λ_row / λ_max` with λ_max the densest level anywhere below the
   cluster the row leaves.

Implemented from the papers; no third-party code was ported. Where they leave
a choice open, the engine follows scikit-learn's documented conventions so
labels can be compared one for one. The `PAPERS` export lists what was
implemented and every deviation. It is deterministic: there is no seed.

## Example: 344 Palmer penguins

The example is the Palmer penguins table (Gorman, Williams & Fraser 2014;
packaged by Horst, Hill & Gorman 2020; CC0; `data/SOURCE.md`): bill length
and depth, flipper length and body mass of three species. Two birds have no
measurements and are left out; species, island and sex are not clustered on.

- **Defaults (excess of mass, minimum cluster size 5): 2 clusters and 2
  noise rows.** One cluster is all 122 Gentoo (long flippers, heavy, shallow
  bills). The other holds 151 Adelie and 67 Chinstrap: in these four
  measurements the two species overlap enough to form one dense region. The
  same split holds for minimum cluster sizes from 5 to 30.
- **Leaf selection, minimum cluster size 15, min samples 5: 3 clusters.**
  122 Gentoo; 108 Adelie with 4 Chinstrap (short bills, light); 42 Chinstrap
  (long, deep bills); 66 rows (19.3%) are noise (43 Adelie, 22 Chinstrap,
  1 Gentoo). Adjusted Rand index against species on the 276 clustered rows
  is 0.966.

Neither answer is wrong: excess of mass reports the groups the data
separates most persistently; leaf reports the tightest cores and leaves the
overlap as noise.

## Verification

HDBSCAN has no randomness, so the check is row for row. `eval/reference.py`
runs **scikit-learn 1.9.1**'s `HDBSCAN` on three tables (the penguins, and
two synthetic tables it writes with fixed seeds: three blobs of different
density plus uniform noise, 310 rows; two moons plus a small third column,
300 rows), each at six settings (minimum cluster size 5 to 30, min samples
default, 3, 5 or 10, excess of mass and leaf), and writes
`eval/reference.json`. `engine.test.mjs` runs the engine on the same data:

| | Result |
| --- | --- |
| Labels (18 cases, 5,712 rows) | all equal |
| Membership (`probabilities_`) | max difference 5e-11 (the JSON's 10-decimal rounding) |
| GLOSH outlier scores (hdbscan 0.8.44's `outlier_scores` on scikit-learn's condensed tree) | max difference 5e-11 |

**One change was needed on scikit-learn's side, and it is a finding.**
Spanning-tree edges of equal weight are common under mutual reachability
(every edge out of a row in a sparse region weighs that row's core
distance; 69 of 309 edges on the blobs table share a weight). scikit-learn
sorts the edges with numpy's default, unstable `argsort`, so equal-weight
merges happen in an order the algorithm does not define, and the condensed
tree can differ. The reference patches only `_process_mst` to sort with
`kind="stable"`; everything else (k-d tree core distances, Prim's tree,
condensing, stability, selection, labelling) is scikit-learn's own code, and
with that one change every label agrees. Against the **unmodified** public
estimator, tie order alone moved at most 1 label of 310 in excess-of-mass
selection and up to 96 of 300 in leaf selection (moons, minimum cluster
size 5). The tests pin both numbers and require an adjusted Rand index above
0.9 against the public labels. A row whose label depends on tie order sits
on a boundary between clusters in any implementation.

Property tests: core distances count the row itself; every spanning-tree
edge weighs at least both core distances; Prim's tree has the same total
weight as Kruskal's on the full graph; the condensed tree accounts for every
row once and every cluster child has at least `min_cluster_size` rows;
stability is non-negative; labels are unchanged by shifting or rescaling a
column and by reversing the row order (up to tie-order noise, ARI > 0.98);
two separated blobs give two clusters with a far stray as noise; a stray
that bridges the two blobs is attached to one at membership 0.0311, as
scikit-learn does on the same points; the CSV export guards against
spreadsheet formula injection. `page.test.mjs` checks the page (disclaimer,
labels, no network calls, the FAQ matches its JSON-LD).

Speed: 10,000 rows of three columns cluster in about 2.5 s in Node 22 on the
build machine (O(n²) distance work); the page refuses more than 10,000 rows.

```
node --test                      # all tests
python3 eval/reference.py        # regenerate the reference (needs scikit-learn, hdbscan, numpy)
```

## Limits

- **A cluster is not a category.** It is a group of rows close together in
  the chosen columns; on the example, two species share one cluster.
- **Read membership, not only the label.** A lone row bridging two clusters
  is attached to one with membership near 0 rather than marked noise.
- **Distances depend on the columns** you choose and how they are scaled.
- **Euclidean distance only**; no prediction for new rows; no
  `cluster_selection_epsilon` (DBSCAN-style flat cut); 10,000 rows at most.
- For outliers judged by isolation rather than density, use
  [`isolation-forest`](../isolation-forest/).

## Licence, credit, disclaimer

MIT (`LICENSE`). The method is Campello, Moulavi & Sander's
(doi:10.1007/978-3-642-37456-2_14), with GLOSH from Campello, Moulavi, Zimek
& Sander (doi:10.1145/2733381) and membership and leaf selection as in
McInnes & Healy (doi:10.1109/ICDMW.2017.12). This project is not affiliated
with them, their institutions, the Palmer Station LTER, scikit-learn or the
hdbscan package. Built with AI assistance.

**No warranty.** Free and as-is, without warranty of any kind. Not legal, tax,
financial or professional advice; results are statistical estimates from the
data you supply, and you are responsible for checking them before relying on
them.
