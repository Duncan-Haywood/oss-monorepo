# simdesign-gaugefine: does the least-mass laser-cut bracket settle with the mesh under a patch-averaged stress rule?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the first next step of `simdesign-gaugepatch`. That project showed that a 3 mm patch-averaged stress converges with the mesh for 39 designs picked on a coarse mesh; it ran no search with the patch rule. This one asks the design question: with the patch rule in force, is the *least-mass feasible design* the same on a coarse (h = 2.5 mm) and a fine (h = 1.0 mm) mesh, and what does it cost under the element-centroid peak rule? Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load. Preliminary, simulated only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-gaugefine/

**Builds on.** `research/simdesign-gaugepatch` (model, rules, patch measure; copied into `src/simdesign_gaugefine/` so the project is self-contained), and through it `simdesign-gaugemesh`, `simdesign-gaugescatter`, `simdesign-patchsearch`, `simdesign-dfm` and `simdesign-bracket`. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser-cut steel sheet (with the laser rules) and the no-rules steel-sheet twin, at sheet gauges b = 1.5, 2 and 3 mm. For each gauge and rule set, a deterministic 20 x 20 grid over arm width w (2 to 25 mm) and fillet radius r (0 to 15 mm) is evaluated on the search mesh (h = 2.5 mm). Cells whose search-mesh patch stress is at most 1.3 x the 100 MPa limit are re-solved at h = 1.0 mm. One solve gives both the element-centroid peak and the patch measure (rho = 3 mm, `PATCH_RHO`), so both rules see the same field. A cell is feasible if it meets the geometric rules, the stress limit under the chosen measure, and the 4 mm tip limit. A grid replaces a stochastic search so that the answer does not depend on a seed.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-gaugefine
python -m pytest -q tests          # 3 tests
python experiments/run.py          # results.txt, results.json (a few minutes on 4 cores)
```

## Results (from `experiments/results.txt`)
Least mass in g (w, r in mm) of any feasible grid cell. The rules and no-rules cases give the same masses; only the argmin radius differs where the laser rule r >= 0.2 mm binds.

| gauge | peak, h = 2.5 | peak, h = 1.0 | patch, h = 2.5 | patch, h = 1.0 |
|---|---|---|---|---|
| 1.5 mm | none | none | none | none |
| 2 mm | 35.40 (15.3, 13.4) | none | 32.31 (14.1, 0.8) | 32.33 (14.1, 2.4) |
| 3 mm | 41.13 (11.7, 7.9) | 45.58 (12.9, 13.4) | 40.81 (11.7, 0.8) | 40.81 (11.7, 0.8) |

- **Under the patch rule the least mass is the same on both meshes** (gauge 2: 32.31 vs 32.33 g; gauge 3: 40.81 vs 40.81 g). Under the centroid peak rule, gauge 2 has no feasible cell on the fine mesh, and gauge 3 needs 10.8% more mass (45.58 vs 41.13 g) with a wider arm and a larger fillet.
- **The patch value barely depends on the fillet radius.** At gauge 2 and w = 14.1 mm the fine-mesh patch stress runs 94 to 102 MPa across r = 0 to 15 mm, while the fine-mesh centroid peak runs 126 to 264 MPa. The 3 mm average is governed by the arm's bending, and it does not distinguish a sharp inside corner (r = 0) from a generous fillet. This is why the patch-rule argmin radius is small and jumps between meshes (0.8 vs 2.4 mm at gauge 2): the mass is flat in r there, so the radius is not determined by this rule.
- **Gauge 1.5 mm is infeasible under every rule and mesh**: the lowest patch stress over the grid on the search mesh is about 172 MPa.

## Limitations
- The patch rule passes a sharp re-entrant corner (r = 0, patch 102 MPa at w = 14.1, which is marginal, against a centroid peak of 213 MPa). Whether the real stress concentration at a laser-cut corner matters (fatigue, notch sensitivity) is outside this model; a design rule that ignores the radius could be unsafe. This result does not show the patch rule is an adequate design criterion.
- Mesh convergence is judged from two meshes. The fine mesh is also not shown to be converged for the centroid peak, which was still rising in `simdesign-gaugemesh`, so "none feasible" under the peak is a statement about h = 1.0 mm.
- The grid has 0.79 mm radius steps and 1.2 mm width steps, so the minima are grid minima. Cells above 1.3 x the limit on the search mesh were not re-solved; a cell whose stress fell sharply on refinement could be missed (the fine-mesh values here were higher, not lower, than the search-mesh ones).
- One load case, 2D plane stress, assumed rule values and materials. Nothing was made or tested.

## Next steps
Add a graded refinement at the fillet tangent point to decide whether the centroid peak has a finite limit; test a rule that couples the patch measure with a minimum radius or a notch factor; extend the grid to gauges 2.5 and 4 mm.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
