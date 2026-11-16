# isolation-forest: find the splittable attributes without a full min/max scan (2026-11-16)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. `platform/ci/venture_suite_times.json`
(2026-11-16 03:01Z) ranks isolation-forest 14th of the venture suites at
14.8 s; no earlier perf note mentions it.

## Reading

- Per file, `node --test <file>` timed with `date`: `engine.test.mjs`
  **11.6 s**, cli 0.35 s, page 0.12 s, usage 0.12 s.
- Inside `engine.test.mjs`, the three "expected scores from 20,000 trees agree
  with scikit-learn" tests take 10.3 s (ionosphere 5.2, breast 2.9,
  wholesale 2.2).
- `node --cpu-prof` on one ionosphere 20,000-tree fit and score (fit 4.9 s,
  score 0.5 s): the inner `node` function of `growTree` has 4.4 s self time.
  Every tree node took the minimum and maximum of **every** column over the
  node's rows (rows x d, d = 34 for ionosphere) only to learn which columns
  are not constant, then used the range of the single column it picked.

## Change (`ventures/isolation-forest/engine.mjs`, `growTree`, `fitForest`)

1. **Early-exit constancy test.** A column can split the node when two of its
   non-NaN values differ. The scan stops at the first differing row, which is
   usually the second; the min/max is then taken for the chosen column only.
   NaN handling matches the old `hi > lo` test (NaN never moves a min or max;
   an all-NaN column is not live), and `0` and `-0` count as equal in both.
2. **Column-major copy.** `fitForest` copies X once into one `Float64Array`
   per column, so those scans read contiguous memory (fit 1.81 s to 1.50 s
   on top of step 1).

The live set, its order, every `rand()` call and every threshold are
unchanged, so the forests are the same bit for bit.

## Verification

- A scratch script grew forests with the old and new engine and hashed every
  tree's `feat`, `thr` (as strings), `left`, `right` and `size`: identical on
  ionosphere, wholesale, breast (its `?` cells as NaN), a 300-row table
  mixing NaN, 0, -0, +-Infinity and constant columns, and a table with an
  all-NaN column; each at three option sets (300 trees seed 1; 50 trees
  seed 9 psi 64; 20 trees seed 3 psi capped to n).
- `python3 platform/ci/run_venture_tests.py isolation-forest`: 41 tests pass.

## Numbers

| | before | after |
|---|---|---|
| ionosphere 20,000-tree fit (bench script, `performance.now`) | 4.76 s | 1.50 s |
| `node --test engine.test.mjs` (two runs each) | 11.7 s | 7.0 s |
| `run_venture_tests.py isolation-forest` | 11.6 s | 6.6 s |

The browser page runs the same engine, so a visitor's analysis gets the same
speed-up (at the default 100 trees it was already quick).

## Not changed, ranked for the next run

1. The constancy scan still walks every row of a column that is constant in
   the node (ionosphere's second column is all zero), about 1.2 s of the
   remaining fit. Dropping columns constant over the whole table once in
   `fitForest`, with indices remapped back to the original columns, would
   remove most of it with the same output.
2. `pathLengths`: 0.4 s per 20,000 trees; `averagePathLength(size)` per leaf
   visit could be stored per leaf at fit time (0.09 s).
3. The tests' 20,000-tree count is what makes the scikit-learn comparison
   tight (Monte Carlo noise about 0.0006 mean); do not lower it.
