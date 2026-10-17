# simdesign-gaugebudget: how much of the peak-stress price scatter of laser-cutting rules is search budget?

Follow-up (a search-budget test, parallel to the gauge-by-gauge look in `simdesign-gaugescatter`, landed by another run) in the simulation-first design track (`PROJECTS.md`, track 5) to `simdesign-filletfloor`, which ruled out a near-sharp fillet floor as the cause of the scatter in the mass price of laser-cutting rules under the peak element stress (price 0.990–1.145 over seeds 0–4) and listed "per-gauge sub-search results, more seeds, or a different optimiser" as next steps. This project looks at the per-gauge sub-searches and at the search budget. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-gaugebudget/

**Builds on.** `research/simdesign-filletfloor` and, through it, `simdesign-patchsearch`, `simdesign-dfm` and `simdesign-bracket` in this repository (the model, rules and optimiser are copied into `src/simdesign_gaugebudget/` so the project stays self-contained; only the experiment script and tests differ); scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); SciPy's `differential_evolution` (Storn and Price, 1997, "Differential Evolution – A Simple and Efficient Heuristic for Global Optimization over Continuous Spaces", *Journal of Global Optimization* 11:341–359). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Peak element stress, laser cutting (floor 0.2 mm, stock gauges 1–12 mm) and the no-rules steel-sheet twin (continuous depth), search mesh h = 2.5 mm, seeds 0–4, the same settings as `simdesign-filletfloor`. The minimum-mass search runs one differential-evolution sub-search per stock gauge. This project keeps the best feasible mass of every sub-search (instead of only the overall winner) at two budgets: the base budget of `optimise()` (popsize 4, 17 iterations per gauge; popsize 8, 25 iterations for the continuous twin) and a larger one, about four times the evaluations (popsize 8, 35 iterations per gauge; popsize 16, 50 for the twin). Masses are at the search mesh; no fine-mesh check was run here.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-gaugebudget
python -m pytest -q tests            # 8 tests
python experiments/run.py            # writes experiments/results.txt and results.json (about 15 minutes on 4 cores)
```

## Results (from `experiments/results.txt`; 5 seeds)
| budget | price by seed 0–4 | mean | sd | range |
|---|---|---|---|---|
| base | 1.145 1.054 0.990 0.994 1.054 | 1.047 | 0.063 | 0.155 |
| about 4× | 1.039 1.018 1.079 1.020 1.026 | 1.037 | 0.025 | 0.061 |

- **Consistency check.** The base-budget prices equal those in `simdesign-filletfloor` (peak, floor 0.2 mm).
- **The scatter lives in one gauge.** At the base budget the 2 mm gauge wins in four seeds (33.3–35.6 g); in seed 0 its sub-search found no feasible design, so the 3 mm gauge won at 41.0 g, which is the 1.145 outlier. Every other gauge from 3 mm up varies by at most 2.2 g across seeds (0.17–2.21 g) and is never the winner except in that seed. Gauges 1 and 1.5 mm were never feasible.
- **More budget helps, but not monotonically.** Seed 0 recovers (33.4 g, gauge 2) and the rules-mass range at base budget, 33.3–41.0 g, narrows to 33.3–35.3 g. Seed 2 gets worse (33.3 → 35.3 g). With the larger budget the gauges of 3 mm and above agree across seeds to within 0.05 g, while the 2 mm sub-search still spreads over 1.99 g (33.3–35.3 g); its designs differ in fillet radius (10.8–13.7 mm) and width (14.3–15.4 mm). Seeds 1 and 3 land on the identical design (33.29 g, w 14.38, r 11.02), so 33.3 g is a repeatable optimum that other seeds miss.
- **The twin also moves.** The no-rules twin falls by 0.9–3.7 g with the larger budget (to 32.2–32.7 g), so the base-budget twin was not converged either; the price sd falls from 0.063 to 0.025 partly because both numerator and denominator change.
- **Reading.** The data are consistent with the explanation "ten sub-searches finding different local optima", localised to the 2 mm gauge, where the peak-stress landscape in (w, r) appears to have several nearby optima. We did not map that landscape, did not test the patch measure here, and cannot say the larger budget has converged (the spread in gauge 2 persists).

## Limitations
- Five seeds, no confidence intervals; one process, one load case, one search mesh (2.5 mm) and no fine-mesh check of the designs.
- Two budgets only; a larger or different optimiser (CMA-ES, multi-start local search) was not tried, so the persistent gauge-2 spread is not attributed to the optimiser or the landscape.
- Stylised 2D plane stress, assumed rule values and materials, polygonal fillet. Nothing was made or tested. Simulated results only.

## Next steps
Map the gauge-2 peak-stress surface over a grid of (w, r) to see whether it has several basins or is simply noisy; try a gradient-free local polish or CMA-ES at equal evaluations; repeat with the patch measure.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
