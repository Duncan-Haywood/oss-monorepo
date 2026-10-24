# simdesign-gaugescatter: what causes the peak-stress price scatter of laser-cutting rules?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5). `simdesign-patchsearch` found that the mass price of laser-cutting rules varied across seeds under the peak element stress (0.99–1.15), and `simdesign-filletfloor` ruled out a near-sharp fillet floor as the cause but left the real cause open. This project looks inside the search, gauge by gauge. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load; a small, preliminary diagnostic.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-gaugescatter/

**Builds on.** `research/simdesign-filletfloor` and, through it, `simdesign-patchsearch`, `simdesign-meshmargin`, `simdesign-patchstress`, `simdesign-dfm` and `simdesign-bracket` in this repository (the model, rules and optimiser are copied into `src/simdesign_gaugescatter/` so the project stays self-contained; only the experiment scripts and tests differ); scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); SciPy's `differential_evolution` (Storn and Price, 1997, *Journal of Global Optimization* 11:341–359). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser cutting (steel sheet, ten stock gauges 1–12 mm, fillet floor 0.2 mm) against the no-rules steel-sheet twin, peak von Mises stress on the search mesh h = 2.5 mm. `optimise` runs one differential-evolution sub-search over (w, r) per gauge and keeps the lightest feasible result. Here each sub-search is run on its own, with the same settings (population 4, 17 iterations), seeds 0–4 (`experiments/run.py`). Beside it, each gauge is scanned on a 30 × 30 grid over (w, r), recording how many cells are feasible and the lightest one. A second script (`experiments/miss_rate.py`) repeats the gauge-2 sub-search for seeds 0–19.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-gaugescatter
python -m pytest -q tests                 # 8 tests
python experiments/run.py                 # results.txt, results.json (about 10 minutes on 4 cores)
python experiments/miss_rate.py           # miss_rate.txt, miss_rate.json (about 3 minutes)
```

## Results (from `experiments/results.txt` and `miss_rate.txt`)
- **Seed 0's high price is a missed sub-search, not a cost of the rules.** The best gauge is 2 mm in 4 of 5 seeds for both rules and twin. For seed 0 the rules sub-search at 2 mm returned no feasible design, so the search fell back to 3 mm (41.0 g against 35.6 g for the twin: price 1.153). For seeds 1–4 the price is 1.000, 1.000, 1.000 and 1.008. Across seeds 0–4 the price has sd 0.068; without seed 0 it is 0.004.
- **The 2 mm gauge has a narrow feasible region.** On the grid only 13 of 900 (w, r) cells are feasible at 2 mm (rules and twin alike), against 405–637 at 3–8 mm. Over seeds 0–19 the rules sub-search missed it once (seed 0 again; 1 of 20) and the twin never did (0 of 20). This is one miss in 20, so the miss rate is only roughly known.
- **Feasible results at 2 mm are bimodal.** The 19 feasible rules masses fall in two groups, 33.3–34.0 g (10 runs) and 35.3–35.6 g (9 runs); the twin shows the same split (10 and 10). Seed 4's 1.008 (35.59 g against 35.31 g) is a small difference inside the upper group. A rules run and a twin run on the same seed can in principle land in different groups, which would shift a price by about 0.06; we did not see that in seeds 1–4. We did not identify what the two groups are.
- **The rules' real mass price is set by the web rule at thick gauges, not by the scatter.** By grid optimum the price per gauge is 1.000 at 2, 4, 5 and 6 mm, 1.004 at 3 mm, and 1.10, 1.55 and 1.98 at 8, 10 and 12 mm (web width at least the sheet thickness). These gauges never win, so they do not enter the search result.
- **Grid optima are not reference optima.** The DE sub-searches often beat the 30 × 30 grid (mean difference −1.85 g over 79 feasible sub-searches, range −7.9 to +1.8 g), so the grid is too coarse for masses; it is used here only for feasible-region size and gauge-level comparison.

## Limitations
- One process, one load case, one mesh (h = 2.5 mm) and one stress measure (peak). Five seeds for the sub-search table, twenty for the gauge-2 miss rate.
- The mesh dependence of the peak was not tested here; the narrow 2 mm region could itself be a mesh effect. Designs were not re-solved on a finer mesh in this project.
- Why the rules search misses but the twin does not on seed 0 (the rule penalties reshape the landscape) is a hypothesis, not tested. The cause of the two mass groups is unknown.
- Stylised 2D plane stress, assumed rule values and materials, polygonal fillet. Nothing was made or tested. Simulated results only.

## Next steps
Re-search with more DE restarts at the thin gauges (or a gauge-aware search that lets a feasible gauge-2 region be found reliably) and see whether the price scatter disappears; re-solve the two mass groups on a fine mesh to see whether they are real or mesh artefacts; calibrate a patch limit and apply the patch measure to `simdesign-holes`.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
