# eda-adapt: how many synthesised designs from a new family does a cell-count surrogate need before it is usable, and is it better to pool them with old families or train on them alone? (follow-up to `eda-surrogate`, track 7)

Why it seemed worth doing: `eda-surrogate` found that a word-level cell-count surrogate is unusable as an estimator on a family it never saw (median error 11% to 210%) but still ranks well. Its own next-steps list asked for "a small adaptation step ... and the break-even number of syntheses". That is the practical question for a search loop: when the design family changes, how many expensive evaluations must be spent before the cheap model can be trusted again? Produced with AI assistance (Claude). **Stylised and preliminary:** 133 small designs, a synthesis-only target, no place and route.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-adapt/

**Builds on.** `research/eda-surrogate` (the 133-design dataset is copied unchanged from it, with its models, which are original code here: non-negative least squares, ridge, gradient boosting through scikit-learn, Pedregosa et al., 2011, *JMLR* 12:2825-2830). Tools behind the dataset: Yosys (Wolf, Glaser and Kepler, 2013, Austrochip) and ABC (Brayton and Mishchenko, 2010, CAV). Context on learning for EDA: Huang et al. (2021), a survey of machine learning for EDA, *ACM TODAES*. The few-shot framing is the ordinary transfer-learning comparison of fine-tuning against training from scratch; no specific paper is reproduced. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
Four generator families (`mac`, `fir`, `alu`, `sorter`; 36, 36, 36, 25 designs) with Yosys 0.33 generic-gate cell counts and 24 word-level features. For each held-out family F, each k in {0, 1, 2, 3, 5, 8, 12, 16}, and each of 30 random draws of k designs from F (the draw seeds are fixed), three surrogates are scored on the remaining designs of F by median absolute percentage error (APE) and Spearman correlation:
- **zero**: trained on the three other families only.
- **scratch**: trained on the k designs only (needs k at least 2).
- **pooled**: the other families plus the k designs, unweighted.

Done for three model kinds (`linear` non-negative least squares, `ridge` on log features, `gbr` boosted trees on log target). "Break-even" is the smallest k whose median-over-draws error is at most 20% (an arbitrary but stated bar).

## Reproduce
```bash
pip install numpy scikit-learn            # Yosys is not needed: the dataset is committed
cd research/eda-adapt
PYTHONPATH=src python -m unittest discover -s tests     # under a second
python experiments/run.py                               # about 3 minutes; writes results.txt and results.json
python experiments/figure.py                            # draws experiments/adapt_linear.svg from results.txt
```

## Results (from `experiments/results.txt`)
Median over the four held-out families of the median APE, in percent (section S of the file; per-family tables with 10th to 90th percentile over draws are above it):

| k | linear: zero | scratch | pooled | ridge: pooled | scratch | gbr: pooled | scratch |
|---|---|---|---|---|---|---|---|
| 0 | 48.6 | - | 48.6 | 46.6 | - | 40.1 | - |
| 1 | 48.3 | - | 18.4 | 26.7 | - | 28.9 | - |
| 2 | 48.6 | 18.6 | 15.5 | 22.1 | 41.0 | 26.4 | 65.4 |
| 3 | 48.6 | 10.8 | 13.3 | 17.1 | 11.9 | 25.8 | 43.6 |
| 5 | 48.6 | 4.8 | 10.4 | 12.7 | 7.8 | 23.6 | 33.1 |
| 8 | 48.6 | 4.3 | 8.2 | 9.0 | 5.6 | 20.2 | 23.6 |
| 16 | 48.6 | 2.9 | 6.8 | 6.2 | 4.6 | 15.0 | 15.0 |

- **One synthesis already helps the linear and ridge models.** Pooling one design from the new family cuts the linear model's median error from 48.6% to 18.4% (ridge 46.6% to 26.7%). Per-family break-even for the linear model (pooled median error at most 20%): k = 3 (`alu`), 1 (`fir`), 0 (`mac`), 2 (`sorter`).
- **Beyond about three designs, forgetting the old families wins for the linear and ridge models.** Linear trained on the new family alone passes the pooled model between k = 2 and 3 (10.8% against 13.3% at k = 3; 4.8% against 10.4% at k = 5), and on `fir` and `mac` reaches 0.7% to 2% by k = 5 to 16. A plausible reason (not tested) is that the pooled fit must compromise between families whose cells-per-feature differ, so the old families add bias rather than information once the new family has a handful of points. The non-negative linear model with 24 features is fitted by only 5 points because the sign constraint makes it sparse.
- **Boosted trees are the opposite.** Trees need many points: scratch is worse than pooled up to k = 12 and they meet at k = 16 (15.0% each), and pooled gbr's median over families first drops below 20% at k = 12 (17.2%); per family it needs k = 12 (`alu`, `mac`), 5 (`sorter`), and 0 (`fir`, already 16.0% zero-shot). Pooled gbr is also *worse* than zero-shot on `alu` for k at most 5 (28% to 32% against 26.8%): a few new points can pull the trees off a good zero-shot guess.
- **Rank agreement is cheap.** Pooled Spearman is 0.84 to 1.00 at every k from 1 up and every model; the zero-shot ranking is already good (0.75 to 1.00), so for screening alone adaptation matters less than for estimating cells.
- Figure: `experiments/adapt_linear.svg`.

## Limitations
- The same 133 designs and four author-written families as `eda-surrogate`; the three "other" families are only three, and the families are small and clean. A real new family (third-party RTL) may be much further from the training families, or closer.
- Draws are random, not chosen. Choosing the k designs well (the smallest, the largest, a spread) is a design-of-experiments question this does not test, and could change the crossover. Pooling is unweighted; upweighting the new family's points is the obvious variant and is not run.
- The target is Yosys generic-gate cells, not area, timing or post-route PPA; one Yosys version and ABC script. The 20% bar is arbitrary. Median-over-draws numbers over four families are descriptive; there is no significance test and differences of a few points are not meaningful.
- The model hyperparameters are fixed defaults and untuned for tiny k.
- Simulated tool runs say nothing about silicon.

## Next steps
Weight the new family's points and choose them (a spread over the feature range) instead of drawing at random; run the adaptation with a post-route target once OpenROAD is available; feed the adapted surrogate into the `eda-proposers` loop as a screen and compare hypervolume at equal syntheses, charging the k adaptation syntheses to the budget.

## Owner steps
None.

## Outside dependencies
None to run (NumPy and scikit-learn from pip). The dataset was produced with Yosys 0.33 in `eda-surrogate`. All code original, MIT.
