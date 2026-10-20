# simdesign-patchsearch: does a patch-averaged stress change what manufacturing rules cost a sized bracket?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5). `simdesign-patchstress` found that a 3 mm patch average of the von Mises field moves 1–6% under mesh refinement where the peak element stress moves 18–41%, and suggested re-running the `simdesign-meshmargin` search with it. This project does that: the minimum-mass L-bracket search under four manufacturing rule sets, once with the peak stress and twice with the patch stress. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values and materials.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-patchsearch/

**Builds on.** `research/simdesign-meshmargin`, `research/simdesign-patchstress`, and through them `simdesign-dfm` and `simdesign-bracket` in this repository (their model, rules, optimiser and patch measure are copied into `src/simdesign_patchsearch/` so the project stays self-contained; the change is an option choosing the stress measure); scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); SciPy's `differential_evolution` (Storn and Price, 1997, *Journal of Global Optimization* 11:341–359). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
For each process (FDM, CNC routing, laser cutting, casting) and its no-process-rules twin, the minimum-mass bracket (arm width w, inner fillet r, depth b) is searched with differential evolution, seeds 0, 1, 2, under three settings:
- **A**: peak element stress, search mesh h = 2.5 mm (the `simdesign-dfm` / `simdesign-meshmargin` setting).
- **P**: patch stress (disc radius 3 mm), h = 2.5 mm, the same numeric stress limit.
- **Q**: patch stress, h = 1.5 mm, the same numeric limit.

Every chosen design is re-solved at the check mesh h = 0.55 mm and both measures are divided by the limit. Price = best mass with rules / best mass without. The limit is **not recalibrated** for the patch measure (`simdesign-patchstress` found the patch reads only 0.45–0.69 of the peak), so P and Q masses are not comparable with A masses: they answer "what if the limit is applied to the patch", not "what is the safe design".

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-patchsearch
python -m pytest -q tests          # 4 tests
python experiments/run.py          # writes experiments/results.txt and results.json (about 25 minutes on 4 cores)
```

## Results (from `experiments/results.txt`; best of 3 seeds)
Check ratio = stress at h = 0.55 mm over the limit, for the rules design; the measure that was searched with is in bold.

| setting | process | mass, rules (g) | mass, no rules (g) | price | price by seed | peak ratio | patch ratio |
|---|---|---|---|---|---|---|---|
| A | FDM | 16.28 | 16.28 | 1.000 | 1.000 1.000 1.000 | **1.19** | 0.91 |
| A | CNC routing | 14.09 | 11.37 | 1.239 | 1.239 1.203 1.228 | **1.34** | 0.88 |
| A | laser cutting | 33.32 | 33.55 | 0.993 | 1.145 1.054 0.990 | **1.29** | 0.91 |
| A | casting | 25.41 | 17.81 | 1.427 | 1.463 1.388 1.425 | **1.23** | 0.84 |
| P | FDM | 13.46 | 13.46 | 1.000 | 1.000 1.000 1.000 | 1.48 | **1.10** |
| P | CNC routing | 12.80 | 10.12 | 1.265 | 1.282 1.261 1.265 | 1.77 | **1.04** |
| P | laser cutting | 30.57 | 29.13 | 1.049 | 1.050 1.046 1.049 | 2.39 | **1.11** |
| P | casting | 21.59 | 16.02 | 1.347 | 1.342 1.329 1.366 | 1.68 | **1.08** |
| Q | FDM | 14.27 | 14.27 | 1.000 | 1.000 1.000 1.000 | 1.32 | **1.02** |
| Q | CNC routing | 12.67 | 10.31 | 1.229 | 1.231 1.270 1.220 | 1.93 | **1.05** |
| Q | laser cutting | 30.81 | 29.85 | 1.032 | 1.030 1.028 1.032 | 2.73 | **1.12** |
| Q | casting | 22.33 | 16.49 | 1.354 | 1.364 1.345 1.358 | 1.59 | **1.02** |

- **The ordering of the prices survives the measure.** Casting (1.35–1.43) > CNC routing (1.23–1.27) > laser cutting (about 1.0–1.05) ≥ FDM (1.000 by construction), in all three settings. The patch measure lowers the casting price slightly (1.43 to 1.35) and raises the CNC price slightly in P (1.24 to 1.27), changes of the size seed scatter can produce in A.
- **The laser-cutting scatter shrinks.** Under the peak measure the three seeds give prices 0.99, 1.05 and 1.15; under the patch measure they span 1.046–1.050 (P) and 1.028–1.032 (Q). A plausible reason is that laser designs use a nearly sharp fillet (r_min = 0.2 mm), where the peak depends on the mesh and the patch does not; this project did not test that explanation. Three seeds in one family of runs is little evidence.
- **Patch-searched designs overshoot less, measured by their own measure.** On the fine mesh the patch ratio of P and Q designs is 1.02–1.12; the peak ratio of A designs is 1.19–1.34. These are different measures, so the comparison shows only that the patch is the steadier of the two quantities being searched, not that the designs are better. Refining the search mesh from 2.5 to 1.5 mm (P to Q) lowered the patch ratio for FDM (1.10 to 1.02) and casting (1.08 to 1.02) and left CNC (1.04 to 1.05) and laser (1.11 to 1.12) unchanged to within the noise.
- **Judged by the peak, the patch designs are far from the limit.** Their peak ratio is 1.3–2.7, largest for laser cutting (2.4–2.7), because the patch average hides the fillet concentration. A patch design is only acceptable if a patch limit was calibrated to a real failure criterion, which this project does not do.
- **Sanity check.** Setting A reproduces the best masses of `simdesign-meshmargin` (16.28, 14.09, 35.37 for seeds 0 and 1; 25.41 g casting) and, with seed 2, the 33.32 g laser figure of `simdesign-dfm`.

## Limitations
- Three seeds per cell, no confidence intervals; differences in price under about 0.05 should be read as noise. The laser rows are the noisiest.
- The patch limit is the peak limit reused, so the P and Q masses are too low by an unknown amount and are not a design recommendation.
- Peak and patch are different quantities; no stress-concentration chart or fine-mesh reference solution is used. The mesh is not graded or nested, and the polygonal fillet (24 segments) and sharp outer corners remain.
- All rule values, materials and the load are assumed numbers from `simdesign-dfm`, in a 2D plane-stress model. Nothing was made or tested. Simulated results only.

## Next steps
Calibrate a patch limit (against a graded-mesh converged fillet solution or a cited stress-concentration chart, checked first) and repeat the search so the masses are comparable; test whether the shrinking laser scatter is due to the near-sharp fillet by adding a fillet floor to the laser rules; apply the patch measure to `simdesign-holes`.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). The rule values, material properties and load are assumptions that real shop data would replace.
