# simdesign-filletfloor: is the laser-cutting price scatter under the patch stress due to the near-sharp fillet?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), and a negative result for one explanation. `simdesign-patchsearch` found that the mass price of laser-cutting rules varied across seeds under the peak element stress (0.99–1.15) but barely under a 3 mm patch average (1.03–1.05), and suggested, without testing it, that this was because laser designs use a nearly sharp inner fillet (floor r_min = 0.2 mm) where the peak depends on the mesh. This project raises the floor and looks. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load.

**Read this first (mesh-convergence check, 2026-11-18).** None of the 40 designs behind the price table meets the 100 MPa limit once the stress is resolved: re-solved at h = 0.25 mm (ten times finer than the 2.5 mm search mesh), every one reads 115–328 MPa, and the peaks are still rising. The price table below therefore compares parts that all fail by design-dependent margins. Thickening each design until it passes on the converged peak (stress scales exactly as 1/b in this model) raises the laser-cutting price under the peak measure from 1.05 to **1.17 (sd 0.063)**, and the patch-searched designs, which ride on small fillets, need 2–4× their depth. Table and method: [Converged-mesh check](#converged-mesh-check-2026-11-18).

**Live page:** https://marisstella.app/research/simdesign-filletfloor/

**Builds on.** `research/simdesign-patchsearch` and, through it, `simdesign-meshmargin`, `simdesign-patchstress`, `simdesign-dfm` and `simdesign-bracket` in this repository (the model, rules, optimiser and patch measure are copied into `src/simdesign_filletfloor/` so the project stays self-contained; only the experiment script and two tests differ); scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); SciPy's `differential_evolution` (Storn and Price, 1997, *Journal of Global Optimization* 11:341–359). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser cutting (steel sheet, stock gauges 1–12 mm) only. The inner-fillet floor r_min is set to 0.2 mm (the `simdesign-dfm` value), 1.0 mm and 3.175 mm (the CNC tool radius, for contrast). For each floor and each stress measure (peak element stress, or 3 mm patch average, both at search mesh h = 2.5 mm and the same numeric limit) the minimum-mass bracket (w, r, b) is searched with differential evolution, seeds 0–4. The no-rules steel-sheet twin is searched under the same measure and seeds; price per seed = rules mass / free mass for the same seed. Each design is re-solved at h = 0.55 mm for the ratios in `experiments/results.json`. The free twin does not depend on the floor, so it is searched once per measure and seed.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-filletfloor
python -m pytest -q tests            # 13 tests
python experiments/run.py            # writes experiments/results.txt and results.json (about 12 minutes on 4 cores)
python experiments/convergence.py    # mesh-convergence check and repaired prices (about 5 minutes on 4 cores)
```

## Results as searched (from `experiments/results.txt`; 5 seeds; search mesh h = 2.5 mm, so every design here fails the limit on a fine mesh, see above)
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

## Converged-mesh check (2026-11-18)
Added after the 2026-11-17 quality audit ([`portfolio/quality/audits/2026-11-17-simdesign-filletfloor.json`](../../portfolio/quality/audits/2026-11-17-simdesign-filletfloor.json)). `experiments/convergence.py` (about 5 minutes on 4 cores; `--refit` re-fits the stored peaks in a second) re-solves every design in `results.json` at h = 2.5, 1.25, 0.8, 0.55, 0.4, 0.3 and 0.25 mm and writes `experiments/convergence.txt` and `convergence.json`. The h = 0.55 values reproduce the `peak_check` values in `results.json` to the last digit.

- **All 40 designs fail the 100 MPa limit on a fine mesh.** At h = 0.25 mm the peak-searched designs read 115–151 MPa and the patch-searched ones 160–328 MPa. Every peak rises monotonically as h falls, so the finest value is a lower bound on the converged peak. Seed 0 at floor 0.2 mm: 99.8, 122.3, 126.7, 132.9, 135.3, 137.6, 138.0 MPa.
- **The converged value is estimated, not measured.** Fitting σ(h) = σ∞ + C h^q to the four finest meshes gives a stable fit for 20 of 40 designs (q between 0.5 and 3.7); for the other 20, q runs to the 0.3 bound and the finest-mesh value is used instead, so their repaired depth is a lower bound.
- **Repaired prices.** In this model (plane stress, load spread over the end face, mesh independent of the depth) every stress scales as 1/b, so each design is thickened to b·σ/100: laser designs round up to the next stock gauge (all still satisfy web ≥ thickness), the free twin stays continuous. This is a minimal repair, not a re-optimisation; a search on the converged stress could find lighter designs for either side.

| measure | floor (mm) | repaired price by seed 0–4 | mean | sd | range |
|---|---|---|---|---|---|
| peak | 0.2 | 1.255 1.199 1.158 1.133 1.091 | 1.167 | 0.063 | 0.164 |
| peak | 1.0 | 1.255 1.199 1.158 1.133 1.091 | 1.167 | 0.063 | 0.164 |
| peak | 3.175 | 0.979 1.154 1.158 1.141 1.083 | 1.103 | 0.076 | 0.180 |
| patch | 0.2 | 1.245 0.823 1.907 1.790 2.649 | 1.683 | 0.694 | 1.826 |
| patch | 1.0 | 1.248 0.821 2.558 1.790 1.982 | 1.680 | 0.670 | 1.737 |
| patch | 3.175 | 1.244 1.039 1.284 1.206 1.310 | 1.217 | 0.107 | 0.272 |

What this changes:
- The **negative result still stands**: the peak-searched designs have 7.6–14.3 mm fillets, so a 0.2 or 1 mm floor cannot bind (the repair does not change r).
- The **price level does not**: with the stress resolved, the laser rules cost about 17% in mass under the peak measure, not 5%, and stock-gauge rounding drives much of it: every 2 mm laser design needs 2.3–2.7 mm and rounds up to 3 mm sheet, the 3 mm seed-0 design needs 4.3 mm and goes to 5 mm, while the free twin thickens continuously to 2.6–3.3 mm.
- The **steady patch price was an artefact of an uncalibrated limit**: the patch-searched designs pass a 3 mm average while their resolved peak is 60–228% over the limit, and their repaired prices scatter more than any peak-searched cell. Patch-searched masses were never a design recommendation; they are not one now either.
- The coarse-mesh error differs from design to design (the h = 2.5 mm reading is 66–86% of the finest one for the peak-searched designs), which is a simpler candidate for the peak-measure scatter than the search landscape the Results section suggests.

## Prior work not cited originally
The hypothesis was already answered by data on disk: `simdesign-patchsearch/experiments/results.json` has the laser designs at fillets of 8.5–13.6 mm. The mesh dependence of stress constraints is long known in stress-constrained optimisation: P. Duysinx and M. P. Bendsøe, "Topology optimization of continuum structures with local stress constraints", *International Journal for Numerical Methods in Engineering* 43(8):1453–1478, 1998; C. Le, J. Norato, T. Bruns, C. Ha and D. Tortorelli, "Stress-based topology optimization for continua", *Structural and Multidisciplinary Optimization* 41(4):605–620, 2010; E. Holmberg, B. Torstenfelt and A. Klarbring, "Stress constrained topology optimization", *Structural and Multidisciplinary Optimization* 48(1):33–47, 2013.

## Limitations
- Five seeds per cell, no confidence intervals; differences in sd between cells with five seeds are weak evidence. Only the laser-cutting process and one load case.
- The limit is the peak limit reused for the patch measure (not calibrated), as in `simdesign-patchsearch`; patch-searched masses are not a design recommendation.
- The peak-scatter cause is not identified; this project only rules out one explanation.
- Stylised 2D plane stress, assumed rule values and materials, polygonal fillet. Nothing was made or tested. Simulated results only.

## Known gaps (quality audit 2026-11-17, updated 2026-11-18)

From [`portfolio/quality/audits/2026-11-17-simdesign-filletfloor.json`](../../portfolio/quality/audits/2026-11-17-simdesign-filletfloor.json). Fixed on 2026-11-18: the converged-mesh check above (defect 0), the scatter caveat and prior work (defects 1, 2, 6), beam-theory, 1/b-scaling, clamp-zone and fine-mesh tests that catch the plane-strain and clamp-exclusion mutants (defect 3), the h ≤ 0.3 mm mesher crash (defect 4) and the dead code in `solve()` (defect 5). Still open:

- The optimiser still searches on the 2.5 mm mesh. A re-run with a converged stress (a graded mesh at the fillet, or a stress-concentration correction) is the real fix; the repaired masses above are an upper bound on the mass such a search would find on each side (not a bound on the price, which is a ratio).
- The engine is copied byte for byte across the `simdesign-*` projects.
- Half the convergence fits are not stable on four meshes (q at its bound); a graded mesh or h < 0.25 mm would pin them.

## Next steps
Re-run the search with the stress constraint evaluated on a converged (graded) mesh; find the cause of the peak-measure scatter (per-gauge sub-search results, more seeds, or a different optimiser); calibrate a patch limit against a graded-mesh converged solution or a cited stress-concentration chart; apply the patch measure to `simdesign-holes`.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
