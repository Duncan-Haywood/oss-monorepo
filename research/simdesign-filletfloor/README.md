# simdesign-filletfloor: is the laser-cutting price scatter under the patch stress due to the near-sharp fillet?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), and a negative result for one explanation. `simdesign-patchsearch` found that the mass price of laser-cutting rules varied across seeds under the peak element stress (0.99–1.15) but barely under a 3 mm patch average (1.03–1.05), and suggested, without testing it, that this was because laser designs use a nearly sharp inner fillet (floor r_min = 0.2 mm) where the peak depends on the mesh. This project raises the floor and looks. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-filletfloor/

**Builds on.** `research/simdesign-patchsearch` and, through it, `simdesign-meshmargin`, `simdesign-patchstress`, `simdesign-dfm` and `simdesign-bracket` in this repository (the model, rules, optimiser and patch measure are copied into `src/simdesign_filletfloor/` so the project stays self-contained; only the experiment script and two tests differ); scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); SciPy's `differential_evolution` (Storn and Price, 1997, *Journal of Global Optimization* 11:341–359). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser cutting (steel sheet, stock gauges 1–12 mm) only. The inner-fillet floor r_min is set to 0.2 mm (the `simdesign-dfm` value), 1.0 mm and 3.175 mm (the CNC tool radius, for contrast). For each floor and each stress measure (peak element stress, or 3 mm patch average, both at search mesh h = 2.5 mm and the same numeric limit) the minimum-mass bracket (w, r, b) is searched with differential evolution, seeds 0–4. The no-rules steel-sheet twin is searched under the same measure and seeds; price per seed = rules mass / free mass for the same seed. Each design is re-solved at h = 0.55 mm for the ratios in `experiments/results.json`. The free twin does not depend on the floor, so it is searched once per measure and seed.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-filletfloor
python -m pytest -q tests            # 6 tests
python experiments/run.py            # writes experiments/results.txt and results.json (about 12 minutes on 4 cores)
```

## Results (from `experiments/results.txt`; 5 seeds)
| measure | floor (mm) | price by seed 0–4 | mean | sd | range | fillet r of the rules designs (mm) |
|---|---|---|---|---|---|---|
| peak | 0.2 | 1.145 1.054 0.990 0.994 1.054 | 1.047 | 0.063 | 0.155 | 8.5, 13.6, 10.7, 11.1, 7.6 |
| peak | 1.0 | 1.145 1.054 0.990 0.994 1.054 | 1.047 | 0.063 | 0.155 | 8.5, 13.6, 10.7, 11.1, 7.6 |
| peak | 3.175 | 0.992 1.014 0.990 1.001 1.046 | 1.009 | 0.023 | 0.056 | 7.7, 12.3, 10.7, 14.3, 10.7 |
| patch | 0.2 | 1.050 1.046 1.049 1.033 1.062 | 1.048 | 0.010 | 0.029 | 7.2, 7.3, 1.9, 2.0, 1.1 |
| patch | 1.0 | 1.053 1.043 1.056 1.033 1.060 | 1.049 | 0.011 | 0.026 | 4.3, 6.9, 1.7, 2.0, 1.9 |
| patch | 3.175 | 1.049 1.055 1.060 1.044 1.051 | 1.052 | 0.006 | 0.016 | 4.6, 3.4, 4.4, 4.9, 4.4 |

- **The designs are not near-sharp.** Under the peak measure the chosen fillet is 7.6–14.3 mm, far above every floor tried, so floors of 0.2 and 1.0 mm give identical designs (rows 1 and 2). The explanation proposed in `simdesign-patchsearch` does not hold for the peak-searched designs, and the scatter there cannot come from a binding fillet floor.
- **Under the patch measure the scatter is small at every floor** (sd 0.010, 0.011, 0.006; range 0.016–0.029), including at 0.2 mm, where three of five designs have fillets of 1.1–2.0 mm. A floor of 3.175 mm, which forces fillets of 3.4–4.9 mm, gives the smallest range, but with five seeds a range of 0.016 against 0.029 is not distinguishable from noise.
- **The peak-measure scatter is mostly in the rules search, not the free twin**: rules masses at floor 0.2 mm are 33.3–41.0 g (seed 0 is the outlier at 41.0 g) against 33.6–35.8 g for the twin. Raising the floor to 3.175 mm lowers the sd of the price from 0.063 to 0.023 under the peak, which suggests the scatter is a property of the search landscape, but the floor does not act through a sharp fillet (those designs have fillets above 7 mm). We did not isolate why; one candidate is the stock-gauge-by-gauge search (ten sub-searches per run) finding different local optima under the noisy peak.
- **Consistency check.** Seeds 0–2 at floor 0.2 mm reproduce the prices in `simdesign-patchsearch` for settings A and P (peak 1.145, 1.054, 0.990; patch 1.050, 1.046, 1.049).

## Limitations
- Five seeds per cell, no confidence intervals; differences in sd between cells with five seeds are weak evidence. Only the laser-cutting process and one load case.
- The limit is the peak limit reused for the patch measure (not calibrated), as in `simdesign-patchsearch`; patch-searched masses are not a design recommendation.
- The peak-scatter cause is not identified; this project only rules out one explanation.
- Stylised 2D plane stress, assumed rule values and materials, polygonal fillet. Nothing was made or tested. Simulated results only.

## Next steps
Find the cause of the peak-measure scatter (per-gauge sub-search results, more seeds, or a different optimiser); calibrate a patch limit against a graded-mesh converged solution or a cited stress-concentration chart; apply the patch measure to `simdesign-holes`.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
