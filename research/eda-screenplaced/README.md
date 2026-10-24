# eda-screenplaced: can a cost model trained on other chip-design families screen a new family's placed area-period Pareto front, even though period is hard to predict? (follow-up to `eda-screenxfer` and `eda-adaptplaced`, track 7)

Why it seemed worth doing: `eda-screenxfer` screened a Yosys cell-count front using cycles as a free second objective. `eda-adaptplaced` then showed placed area is predictable from word-level features but placed period is not (Spearman 0.26 on `fir`). The open step both listed was to feed the cross-family model into a screen with the placements charged to the budget. Here both objectives are placed numbers and each placement pays for both. Produced with AI assistance (Claude). **Preliminary, and the test turns out to be easy** (see Result). No new tool runs: the placed data is `eda-adaptplaced`'s committed `placed.jsonl`.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-screenplaced/

## Result
Pooled over the four families (60 random 75% subsets each), mean fraction of the true front's hypervolume after b placements, from `experiments/results.txt`:

| placements | random | screen, area + period models | screen, area model only (period unpredicted) | screen, no models (constant) |
|---|---|---|---|---|
| 1 | 0.345 | 0.878 | 0.878 | 0.312 |
| 3 | 0.578 | 0.989 | 0.996 | 0.526 |
| 5 | 0.710 | 1.000 | 1.000 | 0.668 |
| 8 | 0.810 | 1.000 | 1.000 | 0.799 |
| 16 | 0.923 | 1.000 | 1.000 | 0.925 |

- A screen whose area and period models never saw the family reaches 1.000 of the front's hypervolume from 6 placements on in every family (3 placements: 0.957 on `fir`, 1.000 on the others). Random reaches 0.923 at 16.
- **Without models the screen is random.** With a constant guess and random tie-breaks it matches random search (0.526 against 0.578 at 3). An earlier run broke ties by design index, which tracks size, and scored 1.000 with no model at all: that was an artefact, fixed by shuffling each space, and is why the shuffle is in `experiments/run.py`.
- **A bad period model does not hurt.** On `fir` the ridge period model has median error 36% and Spearman 0.26 against truth, and the screen with it reaches 0.957 at 3 placements; dropping the period model entirely gives 0.982, so the period model adds nothing. The area model carries the screen.
- **Why it is easy.** Area and period both rise with size, so the true fronts hold 1.0 to 1.6 designs on average (27-design spaces): the front is nearly the single smallest, fastest design, and ranking by predicted area finds it. This says nothing about spaces where the objectives trade off, which is where screens matter.

Per-family tables, 95% bootstrap intervals and paired win rates are in `experiments/results.txt`; figure `experiments/screenplaced_hv.svg`.

## Method
- **Data.** `experiments/dataset.jsonl` (features, copied from `eda-adaptplaced`) joined to `experiments/placed.jsonl` (SKY130 HD, Yosys 0.33 + ABC, OpenROAD wheel placement; see `eda-adaptplaced`). Objectives: repaired area (um^2) and placed period (8 ns minus worst slack, before repair), both as logs, min-max scaled within each space; hypervolume reference (1.1, 1.1) (Zitzler and Thiele, 1999, *IEEE TEC* 3(4):257).
- **Spaces.** Each family, 60 seeds, a random 75% of its designs (27; 19 for `sorter`), shuffled. All methods see the same space.
- **Screen** (`src/eda_screenplaced/screen.py`). Cost models (ridge on log features, `eda-screenxfer`'s models; scikit-learn, Pedregosa et al., 2011) trained on the other three families predict both objectives; designs are ranked by non-dominated front (Deb et al., 2002, *IEEE TEC* 6(2):182) of estimated or, once placed, measured values, ties by hypervolume gain; the best unplaced design is placed, then the models refit with placed designs at weight 5. A test checks that the truth of an unplaced design is never read. Variants: period model replaced by a constant, both constant, and linear (non-negative least squares) models.
- **Baselines.** Random order; a front-first oracle (places the true front first).

## Reproduce
```bash
pip install numpy scikit-learn
cd research/eda-screenplaced
PYTHONPATH=src python -m unittest discover -s tests     # a second
PYTHONPATH=src python experiments/run.py                # about 4 minutes; writes results.txt and results.json
python experiments/figure.py                            # draws experiments/screenplaced_hv.svg
```

## Limitations
- The fronts are tiny (see above), so a perfect score is easy and differences between the model variants vanish; the result does not show the screen works on a real trade-off. A second objective that opposes area (cycles, power, a clock target swept per design) is the needed test.
- Same 133 small author-written designs, one ABC target, placement only (no routing or clock tree), ideal clock, one run per design. Spaces overlap (75% subsets of 36 designs), so bootstrap intervals are optimistic; the scores of the model-based screens are degenerate at 1.000.
- Placement time per design is not measured here, so the budget is a count of placements, not seconds.

## Next steps
Add an objective that trades against area (cycles, a swept clock target, or power) so the true front has several points; run on a family with deliberately conflicting objectives.

## Owner steps
None.

## Outside dependencies
None to run (NumPy, scikit-learn). Placed data from `eda-adaptplaced` (Yosys 0.33, OpenROAD PyPI wheel, SKY130 HD platform files). All other code original, MIT.
