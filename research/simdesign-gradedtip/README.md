# simdesign-gradedtip: does the peak stress at the fillet tangent point of the L-bracket converge under graded mesh refinement?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the open step that `simdesign-gaugepatch` and `simdesign-gaugefine` both list: "add a graded refinement at the fillet tangent point to decide whether the centroid peak has a finite limit". `simdesign-gaugemesh` and `simdesign-meshconverge` found the element-centroid peak stress of the 2 mm laser-cut bracket still rising on uniform meshes down to h = 0.5 mm. Here the elements shrink only near the tangent point, to 0.025 mm. Answer for these four designs: the peak flattens at about 1.09 to 1.14 times its 1.5 mm value, so it does have a finite limit that uniform meshes could not reach. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed material, load and limits. Preliminary, simulated only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-gradedtip/

**Builds on.** `research/simdesign-gaugemesh` (the model, mesher and uniform-mesh peak drift; its source is copied into `src/simdesign_gradedtip/` so the project stays self-contained; the new code is `graded.py`), and `simdesign-meshconverge`, `simdesign-gaugepatch`, `simdesign-gaugefine` (the question). scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Four fixed designs (w, r, b in mm): 14/10/2, 14/14/2, 16/15/2 (laser-cut steel sheet, 100 N tip load) and 12/6/15 (the same steel, deeper part). Each is solved with P2 triangles on a mesh whose element size is `min(h0, hmin + g·d)`, where d is the distance to the tangent point (w, w + r), h0 = 1.5 mm, g is the grading rate and hmin runs 1.5, 0.75, 0.4, 0.2, 0.1, 0.05, 0.025 mm (`src/simdesign_gradedtip/graded.py`). Boundary points, rings of interior points around the tangent point and a background grid outside the graded disc are Delaunay-triangulated. The peak is the maximum element-centroid von Mises stress outside the clamp zone, as in the earlier projects. The grid also varies the polygonal fillet (24, 96, 384 facets) and the grading rate (g = 0.3 and 0.15). Elements stay near 2,000 to 3,000, so every solve takes about 0.1 s.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-gradedtip
python -m pytest -q tests          # 4 tests
python experiments/run.py          # results.txt, results.json (about 10 s)
python experiments/summarise.py    # summary.txt
python experiments/figure.py       # peak_vs_hmin.svg
```

## Results (from `experiments/results.txt` and `summary.txt`; 384-facet fillet)
Peak stress in MPa at hmin = 1.5 (uniform), 0.1, 0.05 and 0.025 mm:

| design | g = 0.3 | spread of last three | plateau / value at 1.5 | g = 0.15 plateau / value at 1.5 |
|---|---|---|---|---|
| w14 r10 b2 | 126.2, 139.3, 139.6, 139.2 | 0.3% | 1.104 | 1.127 |
| w14 r14 b2 | 121.4, 132.9, 133.2, 133.0 | 0.3% | 1.096 | 1.114 |
| w16 r15 b2 | 93.8, 101.8, 101.9, 101.9 | 0.0% | 1.086 | 1.104 |
| w12 r6 b15 | 24.4, 27.2, 27.5, 27.3 | 1.1% | 1.119 | 1.139 |

- **The peak has a finite limit under local refinement.** Over the last 4× refinement (hmin 0.1 to 0.025 mm) the peak moves by 0.0 to 1.1% (g = 0.3) or 0.5 to 2.2% (g = 0.15), with no trend, while the uniform-mesh peak in `simdesign-gaugemesh` was still rising at each step. The earlier reading "slowly converging, possibly a singularity" is not supported here: the fillet joins the arm tangentially, and the stress there is finite.
- **The converged peak is 8.6 to 13.9% above the 1.5 mm value.** The h = 2.5 mm search mesh of the earlier chain was lower still, so the mesh-dependent feasibility reported by `simdesign-gaugemesh` is a resolution effect of that size.
- **The 16/15/2 design is just over the 100 MPa limit when converged** (101.9 MPa at g = 0.3, 103.6 at g = 0.15), consistent with `simdesign-meshconverge`, where the one h = 0.75 mm feasible point (r = 14 mm, w = 16 mm) failed at 0.5 mm. Its coarse-mesh 93.8 MPa was feasible by 6%.
- **The plateau depends a little on the grading rate**: g = 0.15 is 1.7 to 2.7% higher than g = 0.3 at hmin = 0.025 mm. So "converged" here means within about 3%, not exact.
- **The fillet discretisation matters little**: 24 facets differ from 384 by at most 2.1% at hmin = 0.025 mm, 96 facets by at most 0.9%. The 24-facet runs scatter between levels (for example 138.6, 144.6, 141.5 MPa), consistent with the facet corners becoming visible when elements get small.
- **Tip deflection is unchanged by grading** (differences below the fourth digit).

## Limitations
- Four designs, one load case, one fillet type, one element and one stress measure (P2 gradient at the element centroid). A plateau in this measure is not a proof that the underlying continuum stress is finite; it shows no divergence over about 60× in element size (1.5 to 0.025 mm).
- The peak element sits 0.5 to 1.5 mm from the tangent point (`summary.txt`), where graded elements are 0.2 to 0.5 mm, not at the finest cells. Resolution at the point itself is finer than the peak's own, so the plateau mostly says the peak region is resolved, and the dependence on g (about 2%) is the honest error scale.
- No independent reference (analytical stress concentration factor or a different code) was compared.
- Nothing was optimised: no new minimum-mass design is reported.
- Stylised 2D plane stress, assumed material and load. Nothing was made or tested. Simulated results only.

## Next steps
Check the plateau against a reference (a handbook stress concentration factor for a filleted L-corner, or an independent solver); rerun the gauge-2 search on a graded mesh with the peak rule, to see whether any gauge-2 design is feasible at all when converged (the 16/15/2 design says marginal); add a mesh-adaptive step so searches need no hand-set grading.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest). Material, load and limits are assumptions.
