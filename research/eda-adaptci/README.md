# eda-adaptci: is the farthest-point spread's lead over random draws, when adapting a chip-design cost model to a new family, bigger than split noise? (follow-up to `eda-adaptfixed`, track 7)

Why it seemed worth doing: `eda-adaptfixed` reported the spread chooser beating random draws on a fixed test set, but from 5 splits with no interval, and its next step asked for a bootstrap. This repeats the protocol with 40 splits per family and puts a 95% interval on the paired gap. Produced with AI assistance (Claude). **Preliminary:** the same 133 small designs in four author-written generator families (Yosys 0.33 generic-cell-count target, no place and route).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-adaptci/

**Builds on.** `research/eda-adaptfixed` (dataset, models, choosers and split protocol copied unchanged), `research/eda-adaptpick`, `research/eda-adapt`. Models use scikit-learn (Pedregosa et al., 2011, *JMLR* 12:2825-2830); the spread rule is greedy k-centre (Gonzalez, 1985, *Theoretical Computer Science* 38:293-306). No CU Boulder lab's work is built on and no affiliation is implied.

## Method
Per held-out family, split seed 0 to 39 and k in {2, 3, 5, 8}, the surrogate (three other families at weight 1, k chosen pool designs at weight 5) is scored by median APE on the fixed 40% test set. The paired gap is APE(chooser) minus APE(random, median of 20 draws) in percentage points. The 160 (family, split) cells are resampled 5,000 times for a 95% percentile interval of the median gap. Linear (non-negative) and ridge models; spread and extremes choosers.

## Reproduce
```bash
pip install numpy scikit-learn
cd research/eda-adaptci
PYTHONPATH=src python -m unittest discover -s tests   # about 10 s
python experiments/run.py                             # about 45 s; writes results.txt and results.json
python experiments/figure.py                          # draws experiments/gap_spread.svg
```

## Results (from `experiments/results.txt`)
Median gap, percentage points (negative = spread better), 95% interval, share of cells won:

| model | k | gap | 95% interval | wins |
|---|---|---|---|---|
| linear | 2 | -2.45 | -3.02 to -1.63 | 81% |
| linear | 3 | -0.71 | -1.35 to -0.33 | 62% |
| linear | 5 | -1.01 | -1.32 to -0.71 | 71% |
| linear | 8 | -0.73 | -0.97 to -0.53 | 80% |
| ridge | 2 | -1.64 | -2.43 to -1.02 | 65% |
| ridge | 3 | +1.00 | +0.19 to +1.90 | 41% |
| ridge | 5 | -1.45 | -1.89 to -0.70 | 66% |
| ridge | 8 | -0.89 | -1.16 to -0.66 | 73% |

- **For the linear model the spread's lead holds at every k**: all four intervals exclude zero, but the gap is about 1 percentage point at k = 3 to 8, small beside the 5-point differences `eda-adaptpick` suggested.
- **For ridge, k = 3 is a real loss**: the spread is worse than random with the interval above zero (+1.0 points, wins 41%), matching the earlier hint that it loses at k = 3.
- **The extremes chooser is worse than random at k = 2 (linear +5.3, ridge +1.3) and k = 3 (linear +1.3)** and better from k = 5 (-0.8 to -1.9 points), as before.
- **The gain is not uniform across families.** The `alu` family carries the linear k = 2 to 5 gap (-10.9, -4.7, -3.2); for `sorter` the spread is worse than random at k = 3 and 5 (+3.0, +1.2 for linear). The pooled interval therefore overstates how sure one should be for a new family of unknown type.

## Limitations
- The 40 splits of a family reuse the same 33-or-so designs, so the interval measures split-and-draw noise, not variation across a population of designs or families; with four families it is narrow by construction. The per-family medians are the better guide to generalisation, and they disagree in sign for `sorter`.
- Four author-written families, one Yosys version, a cell-count target; weights and feature scaling are untuned; many intervals are looked at (no multiple-comparison correction).
- Simulated tool runs say nothing about silicon.

## Next steps
Hold out whole families to bootstrap over families (needs more than four); repeat with a post-route target once OpenROAD is available; charge the k syntheses to a proposer-loop budget as in `eda-screen`.

## Owner steps
None.

## Outside dependencies
None to run (the dataset is committed; produced with Yosys 0.33 in `eda-surrogate`). All code original, MIT.
