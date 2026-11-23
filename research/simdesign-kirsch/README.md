# simdesign-kirsch: how far below the exact stress concentration does a finite-element peak stress sit, and how fast does it close?

A verification study in the simulation-first design track (`PROJECTS.md`, track 5). The earlier projects `simdesign-meshmargin` and `simdesign-patchstress` found that the peak element stress of an L-bracket keeps rising as the mesh is refined, but had no exact answer to compare it with. A plate with a circular hole under tension does: Kirsch's solution gives a peak stress of exactly three times the remote stress. Here the finite-element code is checked against that solution, and two ways of reading "the peak stress" from the same solution are compared. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model; no real part was made or tested.

**Live page:** https://marisstella.app/research/simdesign-kirsch/

**Builds on.** Kirsch's exact solution for a circular hole in a plate under remote tension: G. Kirsch, "Die Theorie der Elastizität und die Bedürfnisse der Festigkeitslehre", *Zeitschrift des Vereines deutscher Ingenieure* 42 (1898), pp. 797–807 (some bibliographies give 797–802; the pages were not checked against the original), and S. P. Timoshenko and J. N. Goodier, *Theory of Elasticity* (McGraw-Hill, New York; 3rd ed. 1970). The formulas in `model.py` are written from those standard results and checked by `tests/` (free hole edge, uniaxial far field, peak of 3σ) and by the convergence below; they are not copied from any text. Finite elements: scikit-fem (Gustafsson and McBain, *JOSS* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). Within this repository it follows `simdesign-meshmargin` and `simdesign-patchstress`. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- Quarter model of an infinite plate: hole radius a, remote uniaxial tension σ along x, plane stress (E = 1000, ν = 0.3; the stresses do not depend on E). The domain is the quarter annulus a ≤ r ≤ 10a with symmetry conditions on both axes. The outer arc carries the traction of the exact solution, so the finite-element answer should converge to the exact field and any gap is discretisation error.
- P2 triangles on a structured polar mesh, graded radially so cells at the hole are near-square, with n_θ = 4 to 128 cells over the quarter circle (56 to 48 384 elements, h/a = 0.39 down to 0.012 at the hole). The hole and the outer arc are polygons with straight edges, so the geometry itself is approximated.
- Two readings of the peak von Mises stress (exact value 3σ, at the top of the hole, where only the hoop stress is non-zero):
  - **centroid**: the largest element-centroid value, as used in `simdesign-dfm`, `simdesign-meshmargin` and `simdesign-patchstress`;
  - **vertex**: the largest value at the vertices that lie on the hole edge, using each element's own gradient.
- The relative L2 error of the von Mises field at element centroids against the exact field, and, for the centroid that holds the peak, the exact stress at that same point.

## Reproduce
```bash
pip install numpy scipy scikit-fem pytest
cd research/simdesign-kirsch
python -m pytest -q tests          # 6 tests
python experiments/run.py          # writes experiments/results.txt and results.json (a few seconds)
```

## Results (from `experiments/results.txt`; stresses in units of σ, exact peak 3)
| n_θ | elements | h/a | centroid peak | error | vertex peak | error | relative L2 error of field |
|---|---|---|---|---|---|---|---|
| 4 | 56 | 0.393 | 2.183 | −27.2% | 3.021 | +0.69% | 1.1e-2 |
| 8 | 208 | 0.196 | 2.536 | −15.5% | 3.015 | +0.49% | 2.9e-3 |
| 16 | 800 | 0.098 | 2.749 | −8.4% | 3.005 | +0.16% | 7.3e-4 |
| 32 | 3 136 | 0.049 | 2.870 | −4.4% | 3.001 | +0.04% | 1.8e-4 |
| 64 | 12 160 | 0.025 | 2.932 | −2.3% | 3.0003 | +0.011% | 4.6e-5 |
| 128 | 48 384 | 0.012 | 2.966 | −1.1% | 3.0001 | +0.003% | 1.2e-5 |

- **The solver is right; the centroid reading is biased low.** The field error falls at second order (observed order 1.96–2.00 per halving), and at the centroid that holds the peak the finite-element value equals the exact stress at that point to 0.13% at n_θ = 16 and about 0.03% or better from n_θ = 32 (see the `exact@centroid` column in `results.txt`). The shortfall is therefore the stress gradient between the hole edge and the centroid, not solver error.
- **It converges only at first order, from below.** The centroid peak error falls by about half per halving (observed order 0.81 to 0.98) and sits below the exact value on every mesh. The quantity read is von Mises stress, which falls at 8.5σ/a per unit distance into the plate at the top of the hole: the hoop stress falls at 7σ/a and the radial stress rises at 3σ/a, and von Mises takes half of the latter off (both analytic, and confirmed numerically in `results.txt`). The bias is 0.25 to 0.33 of 8.5σ times the element size h at the hole and rises towards 1/3 with refinement (0.300, 0.313, 0.326, 0.329 from n_θ = 16 to 128), which is the distance of a triangle's centroid from its edge: the centroid reads the stress about h/3 inside the edge, and on coarse meshes a little less because the gradient flattens with depth. (Until 2026-11-19 this divided by the hoop slope, 7, and reported a ratio of 0.30 to 0.40 that drifted with refinement; quality audit `portfolio/quality/audits/2026-11-19-simdesign-kirsch.json`.)
- **The vertex reading is nearly exact.** Its error is under 1% on every mesh and falls at second order (observed 1.6–2.0 once n_θ ≥ 8).
- **Consequence for a stress margin.** To make a centroid-based check reach the exact peak here you would multiply it by 1.37, 1.18, 1.09, 1.045, 1.023, 1.012 on the six meshes. This is a smooth-gradient sampling bias, and the same bias explains most of the rising peak in the earlier L-bracket projects: there the peak sits on the fillet, and the vertex reading stays at 139–144 MPa from h = 2.5 to 0.5 mm while the centroid reading rises from 100 to 133 MPa (quality audit `portfolio/quality/audits/2026-11-23-simdesign-meshmargin.json`). It shows a mesh-aware margin should shrink with h relative to the length over which the stress varies; it does not give a ready-made knock-down for other geometries.

## Limitations
- One geometry (a circular hole), one load, one mesh family that is regular and graded, no seeds. A real bracket fillet has a different gradient length, so the numbers above do not transfer; only the mechanism does.
- The domain is a quarter disc of radius 10a with exact-solution tractions, which removes the effect of a finite plate width. For a real plate of finite width the concentration is somewhat higher than 3 (not computed here).
- Hole and outer arc are straight-edged polygons; the sub-1% vertex errors include that geometry error, and the vertex reading may be favourable here because the peak sits at a mesh line (θ = 90°). On an unstructured mesh the vertex maximum may not sit at the peak.
- Linear elasticity only: no yielding, no 3D effects. Simulated results only.
- **Known gaps (quality audit, [`2026-11-19-simdesign-kirsch.json`](../../portfolio/quality/audits/2026-11-19-simdesign-kirsch.json)):** the stress-sampling literature (Barlow's optimal stress points, 1976; Zienkiewicz–Zhu superconvergent patch recovery, 1992) predicts this result and is not yet compared against; there is no nodal-averaging or patch-recovery baseline, which is how practitioners read peak stress; `run.py`'s analysis was untested until 2026-11-19; dependencies are unpinned.

## Next steps
Use the vertex (boundary-point) reading in the `simdesign-meshmargin` search and compare the price ordering; repeat on an unstructured mesh and on the filleted L-bracket, where no exact answer exists (compare against a very fine mesh); a graded-mesh version of `simdesign-patchstress`.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem; pytest for tests). No hardware; the exact solution is classical.

## Figure
`python experiments/figure.py` plots peak-stress error against element size at the hole from the committed `experiments/results.json` and writes `experiments/errors.png` (needs matplotlib; no new results).
