# eda-adaptpick: which few designs of a new family should you synthesise to adapt a cell-count surrogate, and should they count for more? (follow-up to `eda-adapt`, track 7)

Why it seemed worth doing: `eda-adapt` drew its k adaptation designs at random with equal weight, and listed "weight the new family's points and choose them (a spread over the feature range) instead of drawing at random" as its first open step. In a design-search loop the k syntheses are a cost you choose how to spend, so how they are picked is a free lever. Produced with AI assistance (Claude). **Stylised and preliminary:** the same 133 small designs in four generator families, a Yosys generic-cell-count target, no place and route.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-adaptpick/

**Builds on.** `research/eda-adapt` and `research/eda-surrogate` (the dataset is copied unchanged; the models are copied with one change, optional sample weights). Models use scikit-learn (Pedregosa et al., 2011, *JMLR* 12:2825-2830). The farthest-point rule is the standard greedy k-centre heuristic (Gonzalez, 1985, *Theoretical Computer Science* 38:293-306). Tools behind the dataset: Yosys (Wolf, Glaser and Kepler, 2013) and ABC (Brayton and Mishchenko, 2010). No CU Boulder lab's work is built on and no affiliation is implied.

## Method
For each held-out family F, model kind (non-negative linear, ridge, boosted trees), number k of synthesised designs from F, and new-family weight w in {1, 5, 20}, the surrogate is trained on the three other families (weight 1) plus the k chosen designs of F (weight w), and scored by median absolute percentage error (APE) on the remaining designs of F. Four choosers, all using **features only** (never cells; a test checks `choose` has no label argument):
- **random**: uniform draw, 30 draws (the `eda-adapt` baseline);
- **smallest**: the k designs with the smallest total bit-width (cheapest to synthesise);
- **spread**: greedy farthest-point in standardised log1p feature space, started at the point nearest the centroid;
- **extremes**: the smallest and largest design by bit-width, then farthest-point.

The three deterministic choosers give one value per cell; "R" in `results.txt` reports the share of random draws that beat them.

## Reproduce
```bash
pip install numpy scikit-learn            # Yosys is not needed: the dataset is committed
cd research/eda-adaptpick
PYTHONPATH=src python -m unittest discover -s tests     # under a second
python experiments/run.py                               # about 4 minutes; writes results.txt and results.json
python experiments/figure.py                            # draws experiments/pick_linear.svg from results.txt
```

## Results (from `experiments/results.txt`)
Median over the four held-out families of the median APE, in percent (sections S); linear model, w = 5:

| k | random | smallest | spread | extremes |
|---|---|---|---|---|
| 2 | 14.3 | 26.2 | 10.7 | 25.8 |
| 3 | 9.5 | 22.2 | 8.9 | 15.7 |
| 5 | 8.5 | 15.2 | 5.3 | 4.5 |
| 8 | 5.8 | 12.3 | 3.8 | 4.2 |
| 12 | 4.7 | 9.1 | 3.0 | 3.5 |

- **A feature-space spread is the best chooser here, most clearly for the linear model.** At k = 5 and w = 5 it halves the random-draw error for the linear model (5.3% against 8.5%), and the median share of random draws that beat it is 13%. For boosted trees it also helps at w = 1 (17.5% against 22.1% at k = 5, 11.9% against 19.8% at k = 8). For ridge it is mixed: no gain at k = 2 to 3 (22.7% against 16.9% at k = 3, w = 5), a gain from k = 5 (about 7.4% against 9.0%).
- **Picking the smallest designs is the worst choice and never beats random draws at k = 5 to 12** (linear 15.2% against 8.5% at k = 5), despite being the cheapest to synthesise: the cheapest points do not cover the feature range. Whether the saved synthesis time pays for the extra error is not measured.
- **Extremes then spread** matches spread from k = 5 and is worse at k = 2 to 3 (two points at the ends of the range leave the middle uncovered).
- **Weighting the new family's points up helps the linear and ridge models once k is 5 or more.** Linear with random draws at k = 5: 9.9% (w = 1), 8.5% (w = 5), 7.5% (w = 20); with the spread chooser 9.9%, 5.3%, 4.0%. For boosted trees, upweighting hurt at every k (spread, k = 5: 17.5%, 19.3%, 23.7%), so weighting is not model-independent.
- **The two levers add**: for the linear model, k = 5 spread designs at w = 20 (4.0%) is below k = 12 random designs at w = 1 (6.9%), so the same accuracy is bought with fewer than half the syntheses in this dataset.

## Limitations
- Four small, clean, author-written families; one Yosys version and a cell-count target. A real new family may behave differently, and the 133 designs are not independent draws from any population.
- Each chooser is scored on a different remaining set (the held-out designs it did not choose), so rows are comparable but not on identical test points; the spread chooser tends to remove the most unusual designs from its own test set, which could flatter it. A fixed common test set was not run.
- Deterministic choosers give one number per family: the table is a median over four families, with no confidence interval and no significance test. Differences of a few points (for example spread against extremes at k = 5 to 8) are not meaningful.
- The weights {1, 5, 20} and the feature scaling are untuned defaults; the size proxy is the sum of `bits_*` features, not synthesised cells.
- Simulated tool runs say nothing about silicon.

## Next steps
Score every chooser on one fixed common test set per family; feed the adapted surrogate into the `eda-proposers` loop as a screen and compare hypervolume at equal syntheses with the k adaptation syntheses charged to the budget; repeat with a post-route target once OpenROAD is available.

## Owner steps
None.

## Outside dependencies
None to run (the dataset is committed). The dataset came from Yosys 0.33 and ABC in `eda-surrogate`. All code original, MIT.
