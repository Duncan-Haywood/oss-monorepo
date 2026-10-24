# eda-screen: does a cell-count surrogate used as a screen find a chip design's Pareto front with fewer Yosys syntheses than random search or TPE? (follow-up to `eda-adapt` and `eda-proposers`, track 7)

Why it seemed worth doing: `eda-adapt` and `eda-adaptpick` ended on the same open step, to feed a surrogate into the `eda-proposers` loop as a screen and compare at equal syntheses with the surrogate's own fitting syntheses charged to the budget. Here that is done on the 80-design accelerator table. Produced with AI assistance (Claude). **Stylised and preliminary:** one 80-design space from one toy accelerator, generic-gate cell counts, no place and route, and a surrogate that interpolates inside one family (not the cross-family transfer `eda-adapt` studied).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-screen/

## Result
At 12 syntheses a screen that first synthesises 4 well-spread designs finds 0.990 of the true front's hypervolume (95% bootstrap interval 0.989 to 0.992, 100 seeds), against 0.860 for random search and 0.878 for TPE. It beats random on all 100 paired seeds. It reaches the whole front on 87% of seeds by 20 syntheses, where random and TPE reach it on none even at 30.

**Read this with the ablation.** The screen is given cycles and held-out error for all 80 designs for free, because they come from the schedule and a small simulation, not from Yosys. Random and TPE do not use that. A screen with *no* cell-count model (every unmeasured design gets the same guess, so only the free objectives guide it) already gets 0.908, then stalls: it cannot tell designs apart on cell count. So of the gap to random at 12 syntheses (+0.130 for the screen), about +0.048 comes from the free objectives and the rest from the cell-count surrogate. An oracle that knows every cell count reaches 1.000 at 12 (the front has 12 designs).

| syntheses | random | TPE | screen, k=4 | screen, k=6 | screen, k=8 | free objectives only | oracle |
|---|---|---|---|---|---|---|---|
| 6 | 0.770 | 0.770 | 0.889 | 0.702 | 0.702 | 0.901 | 0.993 |
| 8 | 0.815 | 0.815 | 0.951 | 0.900 | 0.768 | 0.901 | 0.996 |
| 12 | 0.860 | 0.878 | 0.990 | 0.982 | 0.971 | 0.908 | 1.000 |
| 20 | 0.911 | 0.944 | 1.000 | 1.000 | 0.999 | 0.908 | 1.000 |
| 30 | 0.943 | 0.980 | 1.000 | 1.000 | 1.000 | 0.908 | 1.000 |

(Mean hypervolume found / true hypervolume; full table with intervals in `experiments/results.txt`; figure `experiments/screen_hv.svg`.) The k fitting syntheses count towards the budget. Below about 6 syntheses a larger k loses: with k=4 the first four syntheses are spent fitting and score 0.654, below random's 0.700 at 4, and the screen overtakes random from 6. Free-objectives-only and oracle are deterministic, so their intervals are degenerate.

## Method
- **Space and table.** `experiments/table.jsonl` is copied unchanged from `research/eda-proposers`: 80 designs (lanes p 1..8, weight width 4..8 bits, ABC script `abc -g` or `abc -fast -g`), three minimised objectives (Yosys cell count, cycles per inference, 1 minus held-out accuracy), normalised to [0, 1]; hypervolume reference (1.1, 1.1, 1.1); true front 12 of 80 designs.
- **Cost model.** Budget = number of Yosys syntheses. Cycles and error are treated as free for the screen. That is an assumption about the flow (cycles are a function of the schedule, accuracy of a small NumPy simulation), not something measured here; random and TPE, as in `eda-proposers`, are charged one evaluation per design and do not exploit it.
- **Screen** (`src/eda_screen/screen.py`). (1) Synthesise k designs chosen by greedy farthest-point in the unit-scaled (p, wb, abc) index space from a random start (Gonzalez, 1985, *Theoretical Computer Science* 38:293-306). (2) Fit ridge regression of log(cells) on `[1, log p, log wb, fast, log p * log wb]`. (3) Predict cells for all 80 designs, join with the free objectives, rank by non-dominated-sorting front (Deb et al., 2002, *IEEE TEC* 6(2):182) with measured designs at their true values. (4) Synthesise the best-ranked unmeasured design, refit, repeat.
- **Baselines.** Random and TPE are the `eda-proposers` implementations, copied. Hypervolume as in Zitzler and Thiele (1999, *IEEE TEC* 3(4):257).
- **Seeds.** 100 per stochastic method. In the screen the seed only chooses the first fitted design.

## Reproduce
```bash
pip install numpy
cd research/eda-screen
PYTHONPATH=src python -m unittest discover -s tests     # about a second
PYTHONPATH=src python experiments/run.py                # about a minute; writes results.txt
python experiments/figure.py                            # draws experiments/screen_hv.svg
```

## Limitations
- One small, smooth, 80-point space in which cell count is close to a log-linear function of p and wb; the surrogate's job is easy here, and the whole space is only 80 designs, so 12 to 20 syntheses are already a quarter of it. Nothing is said about large or rough spaces.
- The surrogate is trained and used inside the same family. It is not the cross-family adaptation of `eda-adapt`, so this does not show that a surrogate trained on other families would screen a new one.
- The free-objectives assumption favours the screen over random and TPE. A fair "cheap-aware" random baseline (random among designs not dominated on the free objectives) was not run.
- Cell count is Yosys generic cells; the `-fast` rows were not gate-level re-simulated (inherited from `eda-proposers`). Not a claim about silicon.
- No tuning of the ridge strength or feature set; no significance test beyond bootstrap intervals over seeds.

## Next steps
A cheap-aware random baseline; run the screen with a surrogate trained on other families only (`eda-adapt`'s setting) on a larger, rougher space; repeat with a post-route target once OpenROAD is available.

## Owner steps
None.

## Outside dependencies
None to run (NumPy). The table was produced with Yosys 0.33 in `eda-proposers`. All code original except the copied `hv.py`, `proposers.py` and table, all MIT.
