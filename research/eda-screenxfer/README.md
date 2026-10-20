# eda-screenxfer: can a cost model trained on other chip-design families screen a new family's Pareto front with a handful of Yosys syntheses? (follow-up to `eda-screen` and `eda-adapt`, track 7)

Why it seemed worth doing: `eda-screen` found that a cell-count surrogate used as a screen reaches the Pareto front far sooner than random search, but its surrogate was fitted inside the family it screened, and its own next step asked for a surrogate trained on *other* families. `eda-adapt` showed such transfer models mis-predict absolute cell counts by tens of percent. A screen only needs the *ranking* right, so this project asks whether that is enough. Produced with AI assistance (Claude). **Stylised and preliminary:** two small families (MAC engine and FIR filter, 27 designs per sampled space), Yosys generic-cell counts, one free objective, no place and route.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-screenxfer/

## Result
A screen whose cost model never saw the new family (a non-negative linear model of Yosys's per-type bit-width features, trained on the other three families) finds 0.936 (MAC) and 0.983 (FIR) of the true front's hypervolume with 3 syntheses, and 0.986 / 0.994 with 4, on 100 sampled spaces per family. Random search needs about 20 syntheses to reach 0.96 (mean 0.968 MAC, 0.959 FIR). At 8 syntheses the transfer screen's 95% bootstrap interval is 0.996 to 1.000 or better in both families, against 0.828 to 0.861 (MAC) and 0.809 to 0.848 (FIR) for random.

**The cost model's absolute error is large, and it does not matter much.** The ridge variant's median absolute error on FIR is 222% (linear: 38%; MAC 22% and 18%), yet its screen reaches 0.992 of the front at 3 syntheses on FIR. Rank correlation with true cell counts is 0.76 to 0.999. A constant cost model (every unmeasured design guessed alike) reaches only 0.826 / 0.680 at 3 syntheses and tracks the free objective, so the ranking information is what the screen uses.

| syntheses | random | free objective only | transfer, ridge | transfer, linear | transfer, ridge + refit | + 3 spread syntheses first | front-first oracle |
|---|---|---|---|---|---|---|---|
| 3 (MAC) | 0.659 | 0.680 | 0.960 | 0.936 | 0.972 | 0.585 | 0.856 |
| 3 (FIR) | 0.648 | 0.826 | 0.992 | 0.983 | 0.993 | 0.713 | 1.000 |
| 8 (MAC) | 0.844 | 0.792 | 0.997 | 1.000 | 1.000 | 1.000 | 1.000 |
| 8 (FIR) | 0.829 | 0.873 | 1.000 | 0.998 | 1.000 | 1.000 | 1.000 |
| 12 (MAC) | 0.908 | 0.869 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |

(Mean fraction of the true hypervolume; every budget, intervals and paired win rates are in `experiments/results.txt`; figure `experiments/screenxfer_hv.svg`.)

- **Refitting on the screen's own measured designs adds little.** Adding each synthesised design to the training set (weight 5) is better than no refit in 44% of MAC spaces at 8 syntheses and ties otherwise; by 12 it never differs.
- **Spending the first syntheses on a farthest-point spread (the `eda-adaptfixed` rule) hurts early.** It scores 0.585 against 0.972 at 3 syntheses on MAC because those syntheses are charged to the budget and mostly land off the front. It catches up by 6 to 8. With a good transfer model there is nothing for adaptation designs to fix.
- **The "front-first oracle" is not an upper bound at tiny budgets.** It synthesises true-front designs in index order, so a screen can beat it at 3 syntheses (MAC) by picking well-spread front points.

## Method
- **Spaces.** `experiments/dataset.jsonl` is copied unchanged from `research/eda-adaptfixed` (133 designs, four generator families, Yosys 0.33 cell counts and cycles per inference). Only MAC and FIR have cycles that vary, so only they have two objectives; ALU and sorter (cycles = 1) are used as training data but not screened. Each of 100 seeds takes a random 75% of the family (27 designs) as the space; all methods run on the same space. Objectives: log cells (costs one synthesis) and cycles (free, since it follows from the schedule: an assumption, as in `eda-screen`), min-max scaled within the space; hypervolume reference (1.1, 1.1); score = hypervolume of the synthesised designs over the space's true-front hypervolume (Zitzler and Thiele, 1999, *IEEE TEC* 3(4):257).
- **Screen** (`src/eda_screenxfer/screen.py`). Fit a cost model on the three other families' rows; predict log cells for every design in the space; rank designs by non-dominated front (Deb et al., 2002, *IEEE TEC* 6(2):182) of (estimated or, if synthesised, true cells; cycles); synthesise the best-ranked unmeasured design (ties by hypervolume gain). Models are those of `eda-adaptpick` (scikit-learn: Pedregosa et al., 2011, *JMLR* 12:2825-2830). The tests check that the screen never reads the true cells of a design it has not synthesised.
- **Baselines.** Random order; lowest-cycles-first with random ties; "free objective only" (the same, deterministic); a constant cost model; the front-first oracle.
- **Statistics.** 95% percentile bootstrap over the 100 spaces. The spaces overlap (each is 75% of 36 designs), so they are not independent draws and the intervals are optimistic.

## Reproduce
```bash
pip install numpy scikit-learn            # Yosys is not needed: the dataset is committed
cd research/eda-screenxfer
PYTHONPATH=src python -m unittest discover -s tests     # a second
PYTHONPATH=src python experiments/run.py                # about 90 s; writes results.txt and results.json
python experiments/figure.py                            # draws experiments/screenxfer_hv.svg
```

## Limitations
- The true fronts are tiny (about 5 designs in MAC, 3 in FIR) because cells and cycles trade off almost monotonically with lane count, and there are two objectives only. That is an easy search problem; the near-perfect scores say the problem is easy for any screen with a roughly right ordering, not that this screen is strong. Nothing here covers large, rough or many-objective spaces.
- Two target families, with the other three as training data: the training families resemble the target (all small datapath blocks built from Yosys word-level cells). A family with different cell types would be a harder test and was not run.
- Cell count is Yosys 0.33's generic cell count, not area, power or post-route timing. Simulated tool runs say nothing about silicon.
- Cycles are treated as free; if they needed a simulation per design, the budgets here would understate the cost of every method.
- The 75% subsamples overlap, the cost-model hyper-parameters are untuned, and boosted trees were left out for run time.

## Next steps
Hold out a family whose cell mix differs from the others; add a third objective (the held-out error of `eda-proposers`); repeat with a post-route target once OpenROAD is available.

## Owner steps
None.

## Outside dependencies
None to run (NumPy, scikit-learn; dataset committed, produced with Yosys 0.33 and ABC in `eda-surrogate`). All code original except `models.py` (copied from `eda-adaptfixed`), MIT.
