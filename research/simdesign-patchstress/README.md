# simdesign-patchstress: does a patch-averaged stress converge under mesh refinement where the peak element stress does not?

Follow-up to `simdesign-meshmargin` in the simulation-first design track (`PROJECTS.md`, track 5), taking up its first next step. That project found the peak element stress of the L-bracket still rising as the mesh is refined (100 to 126 MPa from h = 2.5 to 0.7 mm in a spot check), so a stress limit checked on any one mesh is a moving target. Here four stress measures are compared on one mesh sequence. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed material values.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-patchstress/

**Builds on.** `research/simdesign-meshmargin` and, through it, `simdesign-dfm` and `simdesign-bracket` in this repository (the model in `src/simdesign_patchstress/model.py` is copied from `simdesign-meshmargin` so the project stays self-contained; the only change is an option to return the stress field); scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Four L-bracket designs (arm width w, inner fillet radius r, depth b = 5 mm; 100 N tip load; assumed aluminium plate, E = 69 GPa, nu = 0.33) are solved with P2 triangles on five meshes, h = 2.5, 1.8, 1.2, 0.8, 0.55 mm. The stress field is the von Mises stress at element centroids, excluding the clamp zone (one arm width). Four measures are taken from it:
- **peak**: the largest centroid value (what `simdesign-dfm` and `simdesign-meshmargin` used);
- **patch rho**, rho = 1, 2, 3 mm: the largest area-weighted mean of the field over a disc of radius rho centred on one of the 200 highest centroids.

The mesh is a Delaunay triangulation of a regular grid plus the boundary (see `model.py`), not a graded mesh, so successive meshes are not nested and some of the scatter below is mesh-to-mesh noise rather than a systematic trend. For orientation each design's elementary-beam bending stress 6F(L - w/2)/(b w²) at the arm is also printed; it ignores the fillet.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib pytest
cd research/simdesign-patchstress
python -m pytest -q tests          # 5 tests
python experiments/run.py          # writes experiments/results.txt and results.json (about 20 seconds)
```

## Results (from `experiments/results.txt`; MPa; full tables there)
Change in each measure from the coarsest (h = 2.5 mm) to the finest (h = 0.55 mm) mesh, and the finest-mesh patch-3 value as a share of the finest-mesh peak:

| design | peak | patch 1 | patch 2 | patch 3 | patch 3 / peak (h = 0.55) |
|---|---|---|---|---|---|
| w12 r2 | +41% | +5% | +13% | +6% | 0.45 |
| w12 r6 | +26% | +12% | +7% | +5% | 0.62 |
| w12 r12 | +23% | +12% | +5% | +4% | 0.69 |
| w8 r6 | +18% | +1% | −5% | +1% | 0.60 |

- **The peak drifts most.** Over the whole sequence it rises by 18–41%, the sharper the fillet the more. The patch measures move by −5% to +13%, and patch 3 (rho = 3 mm) by 1–6% in all four designs.
- **Between the last two meshes the peak looks nearly settled** (changes of 0.4–3.0%), but its path is not monotone for the w12 r6 design (63.9, 63.7, 75.7, 78.5, 80.4 MPa), so a two-mesh comparison could have fooled us. Patch 1 is also non-monotone: its disc holds only a handful of elements on the coarse meshes.
- **The patch measure is not conservative.** It reads 0.45–0.69 of the fine-mesh peak, because it averages away the local concentration. A limit written for the peak cannot be applied to it unchanged; it needs a limit calibrated on the same measure (for example against tests, or against a converged fillet solution), which this project does not do.

## Limitations
- Four designs, one load case, one mesh family, one run each: no seeds or intervals, and the h-sequence is not nested, so scatter and trend are mixed. A graded mesh refined towards the fillet would separate them.
- "Converged" is judged only by the changes along this sequence; there is no reference solution or analytic fillet factor here, and the polygonal fillet (24 segments) and the sharp outer corners remain.
- The sharp fillet (r = 2 mm) is the case where the peak is least trustworthy and the patch values least comparable (0.45 of peak), so the right patch radius depends on the geometry, and the project did not find a rule for it.
- Material and load are assumed numbers from `simdesign-dfm`; nothing was made or tested. Simulated results only.

## Next steps
Use a graded, nested mesh; calibrate a patch limit against a fine-mesh peak or a published stress-concentration chart (cite and check the source first); re-run the `simdesign-meshmargin` search with the patch measure and check whether the price ordering and the laser-cutting noise change; apply the same measure to `simdesign-holes`.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, matplotlib; pytest for tests). The material and load are assumptions that real data would replace.
