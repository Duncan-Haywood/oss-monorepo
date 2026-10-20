# eda-adaptfixed: does a farthest-point spread still beat random draws when every chooser is scored on the same held-out designs? (follow-up to `eda-adaptpick`, track 7)

Why it seemed worth doing: `eda-adaptpick` reported that choosing the k adaptation designs by farthest-point spread roughly halves a cell-count surrogate's error against random draws, but scored each chooser on the designs it had *not* chosen, so the test sets differed and its own limitations section said the spread rule might flatter itself. Its first listed next step was one fixed common test set. This project does that. Produced with AI assistance (Claude). **Stylised and preliminary:** the same 133 small designs in four generator families, a Yosys generic-cell-count target, no place and route.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-adaptfixed/

**Builds on.** `research/eda-adaptpick` (dataset, models and choosers copied, with the test-set logic changed), `research/eda-adapt`, `research/eda-surrogate`. Models use scikit-learn (Pedregosa et al., 2011, *JMLR* 12:2825-2830); the farthest-point rule is the greedy k-centre heuristic (Gonzalez, 1985, *Theoretical Computer Science* 38:293-306). Dataset tools: Yosys (Wolf, Glaser and Kepler, 2013) and ABC (Brayton and Mishchenko, 2010). No CU Boulder lab's work is built on and no affiliation is implied.

## Method
Each held-out family is split five times (seeds 0 to 4) into a pool (60%) and a fixed test set (40%). Each of four choosers (random, smallest, spread, extremes; defined in `eda-adaptpick`) picks k in {2, 3, 5, 8} designs **from the pool, by features only**; the surrogate is trained on the other three families (weight 1) plus the chosen designs (weight w in {1, 5}) and scored by median absolute percentage error on the fixed test set, which no chooser can alter (tests check the split is disjoint, seeded and that `choose` takes no labels). Random is the median of 20 draws. Models: non-negative linear, ridge, boosted trees. k stops at 8 and w at 5 because the smallest family (sorter, 25 designs) has a pool of only 15.

## Reproduce
```bash
pip install numpy scikit-learn            # Yosys is not needed: the dataset is committed
cd research/eda-adaptfixed
PYTHONPATH=src python -m unittest discover -s tests
python experiments/run.py                 # writes results.txt and results.json
python experiments/figure.py              # draws experiments/fixed_linear.svg from results.txt
```

## Results (from `experiments/results.txt`)
Median over 4 families x 5 splits of the median APE, percent; linear model, w = 5:

| k | random | smallest | spread | extremes |
|---|---|---|---|---|
| 2 | 13.7 | 22.8 | 9.7 | 21.8 |
| 3 | 9.1 | 18.4 | 7.7 | 13.5 |
| 5 | 6.0 | 14.0 | 4.8 | 4.3 |
| 8 | 5.2 | 6.9 | 2.9 | 3.2 |

- **The ranking survives, the size of the win shrinks.** The spread has the lowest or near-lowest error for the linear model at every k, but the gain over random is 20 to 45% at k = 5 to 8 (4.8 against 6.0; 2.9 against 5.2), not the halving `eda-adaptpick` reported (5.3 against 8.5 at k = 5). Part of that earlier margin was therefore the test-set difference, though the random baseline here also has a smaller pool, so the two numbers are not strictly comparable.
- **It is not a uniform win.** The spread beats random in 50 to 80% of the 20 (family, split) cells for the linear model (table W in `results.txt`), 35 to 85% for ridge and 70 to 90% for boosted trees. For ridge at k = 3 it loses more often than it wins (it wins 35% of cells at both weights).
- **Smallest-first is still the worst** at most k (linear w = 5, k = 5: 14.0% against 6.0%), winning in 5 to 30% of cells for the linear and boosted models.
- **Extremes** matches the spread from k = 5 and is worse at k = 2 to 3, as before.
- **Boosted trees** gain most from the spread (w = 1, k = 5: 16.4% against 22.6%).

## Limitations
- Four small, clean families; five splits of 133 designs are not independent, and there is no confidence interval or significance test. Differences of a point or two (spread against extremes at k = 5 to 8) mean nothing.
- Choosers see only a 60% pool, so k and the pool are smaller than in `eda-adaptpick`; the fixed test sets are 10 to 14 designs each, so one split's median is noisy.
- Weights {1, 5} and the feature scaling are untuned; the size proxy is the sum of `bits_*` features. One Yosys version, cell-count target, no post-route numbers. Simulated tool runs say nothing about silicon.

## Next steps
Feed the adapted surrogate into the `eda-proposers` loop as a screen and compare hypervolume at equal syntheses with the k adaptation syntheses charged to the budget; repeat with a post-route target once OpenROAD is available; add a confidence interval by bootstrapping over splits.

## Owner steps
None.

## Outside dependencies
None to run (dataset committed, from Yosys 0.33 and ABC in `eda-surrogate`). All code original, MIT.
