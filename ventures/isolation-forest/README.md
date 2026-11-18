# Isolation forest: find outliers and anomalies in a CSV

**Which rows of my data are unusual?** Paste a table (customers and what they
spend, orders, expense lines, sensor readings) and an isolation forest, the
method of Liu, Ting & Zhou (2008; journal version 2012), ranks every row from
most to least unusual across all its numeric columns at once. You get:

- an **anomaly score** from 0 to 1 for every row (near 1: isolated almost at
  once, an anomaly; well below 0.5: ordinary; everything near 0.5: no distinct
  anomaly in the data);
- the rows **flagged** as anomalies, either every score above 0.5
  (scikit-learn's `contamination="auto"` rule) or a chosen top share;
- for each top row, **what stands out**: the columns 2 or more robust
  standard deviations from their median, or a note that only the
  combination is rare;
- a score histogram, a two-column scatter coloured by score, and a CSV of
  every row's score and rank.

Live page: https://marisstella.app/isolation-forest/ (runs in the browser;
nothing is uploaded).

```
node cli.mjs data/wholesale-customers.csv                    # the example
node cli.mjs orders.csv --columns amount,items,discount      # choose the features
node cli.mjs orders.csv --contamination 0.02 --label order_id
node cli.mjs orders.csv --trees 2000 --seed 7                # steadier scores
node cli.mjs orders.csv --csv > scores.csv                   # every row: score, rank, flag
node ../../platform/agents/tools.mjs call isolation-forest analyze --input '{"csv":"...","contamination":0.05}'
```

Input is a CSV (comma, tab or semicolon) with a header row; a headerless
numeric table gets columns `c1`, `c2`, .... Every numeric column is a feature
unless it looks like an ID (a name such as `id` or `customer_id`, or strictly
increasing integers) or a code with three or fewer integer values; text
columns are never features. The first ID or text column labels the rows.
Missing cells (empty, `NA`, `?`, ...) are filled with the column median and
reported. From code, `fitForest(X, opts)` and `scoreRows(model, rows)` score
new rows against a forest grown on old ones.

## How it works

Each of `t = 100` trees is grown on `psi = 256` rows drawn without
replacement. At every node a column is chosen at random among those not
constant in the node, and the rows are cut at a value drawn uniformly
between its minimum and maximum; growth stops at one row, identical rows, or
depth `ceil(log2 psi) = 8`. A row's path length is the number of cuts to its
leaf plus `c(size)` for rows still sharing that leaf, with
`c(n) = 2H(n-1) - 2(n-1)/n`, `H(i) ~ ln i + 0.5772`, `c(2) = 1`, `c(n<2) = 0`.
The score is `s = 2^(-E[h] / c(psi))`. Randomness is a seeded mulberry32
generator, so a seed always gives the same forest. Implemented from the
papers' Algorithms 1-3; no third-party code was ported. The `PAPERS` export
lists what was implemented and every deviation.

## Example: 440 wholesale customers

The example is the UCI *Wholesale customers* table (Cardoso 2013, CC BY 4.0;
`data/SOURCE.md`): a year's spending by clients of a Portuguese distributor
on six product groups. Channel and Region are codes and are left out by
default. With the defaults (100 trees, 256 rows each, seed 42):

- **33 of 440 rows (7.5%) score above 0.5**; the median score is 0.380 and
  the highest 0.781;
- the top row is **row 184**: delicatessen 47,943 (the median is 966),
  frozen 36,534 and milk 43,950;
- all of the top ten are big spenders in at least one group.

**Long tails decide what "unusual" means.** Run the same table with the log
of each amount and eight of the top ten become customers who buy almost
nothing in one or two groups (row 155 spent 8 on delicatessen and 55 on
milk). Neither ranking is wrong; they answer different questions, so the
page's limits section says so.

**Seeds.** Over ten seeds at 100 trees, a row's score has a standard
deviation of 0.008 (median row), 0.012 (90th percentile) and 0.024 (worst
row), which is why the page tells readers rows with close scores can swap.

## Verification

The engine and scikit-learn's `IsolationForest` draw different random numbers,
so the same seed cannot give the same trees. What must agree, if both grow
trees by the same rules, is each row's **expected** score. `eval/reference.py`
fits scikit-learn **1.9.1** with 20,000 trees on three public datasets and
writes `eval/reference.json`; `engine.test.mjs` fits the engine with 20,000
trees and compares every row:

| Dataset | Rows × features | Max abs. difference | Mean abs. difference |
| --- | --- | ---: | ---: |
| Wholesale customers (example) | 440 × 6 | 0.0033 | 0.0006 |
| UCI Ionosphere (one constant column) | 351 × 34 | 0.0025 | 0.0006 |
| UCI Breast Cancer Wisconsin (16 missing) | 699 × 9 | 0.0029 | 0.0005 |

Two runs of the engine itself with different seeds differ by 0.0029 at most on
the wholesale data, so the gap to scikit-learn is Monte Carlo noise, not a
different rule. The test asserts a maximum under 0.006, a mean under 0.0012
and an average signed difference under 0.0006. At the default 100 trees,
the mean AUC over seeds against the datasets' labels is 0.855 on Ionosphere
(scikit-learn 0.855, 50 seeds) and 0.985 on Breast Cancer Wisconsin
(scikit-learn 0.985). `c(n)` matches scikit-learn's `_average_path_length` to
1e-12.

Property tests: scores are unchanged when a column is scaled or shifted; a
planted point far from a Gaussian cloud ranks first above 0.75; the same seed
reproduces the forest; constant columns are never split; duplicate rows
share a leaf; path lengths respect the height limit; the CSV export guards
against spreadsheet formula injection. `page.test.mjs` checks the page
(disclaimer, labels, no network calls, the FAQ matches its JSON-LD).

```
node --test                      # 41 tests
python3 eval/reference.py        # regenerate the scikit-learn reference (needs scikit-learn, numpy)
```

## Limits

- **Unusual is not wrong.** A high score means rare in this data, not an
  error, a fraud or a problem.
- **Axis-parallel cuts** miss a row that breaks a diagonal relationship
  between columns; a ratio column helps. The extended isolation forest
  (Hariri, Carrasco Kind & Brunner 2021) and SCiForest (Liu, Ting & Zhou
  2010) are not implemented.
- **Numbers only**; categories are not used.
- For one series over time, use the `matrix-profile-explorer` or
  `changepoint-detector` instead.

## Licence, credit, disclaimer

MIT (`LICENSE`). The method is Liu, Ting & Zhou's (doi:10.1109/ICDM.2008.17,
doi:10.1145/2133360.2133363); this project is not affiliated with them,
their institutions, the UCI repository or scikit-learn. Built with AI
assistance.

**No warranty.** Free and as-is, without warranty of any kind. Not legal, tax,
financial or professional advice; results are statistical estimates from the
data you supply, and you are responsible for checking them before relying
on them.
