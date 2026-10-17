# simdesign-gaugemesh: is the narrow 2 mm laser-cut bracket region a mesh artefact?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5). `simdesign-gaugescatter` found that the 2 mm sheet gauge, which wins the laser-cutting bracket search, is feasible in only 13 of 900 grid cells on the search mesh (h = 2.5 mm), and listed "re-solve on a fine mesh" as an open step. This project does that. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load. Negative result for the search mesh: preliminary and simulated only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-gaugemesh/

**Builds on.** `research/simdesign-gaugescatter` and, through it, `simdesign-filletfloor`, `simdesign-patchsearch`, `simdesign-meshmargin`, `simdesign-dfm` and `simdesign-bracket` (the model, rules and optimiser are copied into `src/simdesign_gaugemesh/` so the project stays self-contained; only the experiment scripts and tests differ). `simdesign-kirsch` measured the same direction of error on a plate with a hole, where the element-centroid peak sits below the exact value on coarse meshes. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
The 39 gauge-2 designs that `simdesign-gaugescatter` found feasible at h = 2.5 mm are read from its `experiments/miss_rate.json`: 19 under the laser rules and 20 for the no-rules steel-sheet twin (seeds 0–19; one rules seed missed the region). Each is re-solved, with the same element (P2 triangles), load, peak measure (maximum element-centroid von Mises stress outside the clamp zone) and limits (100 MPa, 4 mm tip), at h = 2.5, 1.5, 1.0 and 0.75 mm (`experiments/run.py`). `experiments/arc.py` re-solves three designs with 24, 96 and 384 facets in the polygonal fillet.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-gaugemesh
python -m pytest -q tests          # 4 tests
python experiments/run.py          # results.txt, results.json (about 25 s)
python experiments/arc.py          # arc.txt (about 1 min)
```

## Results (from `experiments/results.txt` and `arc.txt`)
- **None of the 39 designs stays feasible on a finer mesh.** All are feasible at h = 2.5 mm (peak 97.2–100.0 MPa, by selection); at h = 1.5, 1.0 and 0.75 mm the count is 0 of 19 (rules) and 0 of 20 (twin). The tip deflection is not the cause: it changes by under 0.1% between meshes (`test_tip_deflection_converges_with_mesh`). The failure is the stress limit.
- **The coarse mesh underestimates the peak.** Median peak stress: rules 99.3 MPa at h = 2.5, 109.9 at 1.5, 117.0 at 1.0 and 120.9 at 0.75; the twin gives 99.7, 107.9, 117.9 and 121.1. The ratio of the h = 0.75 peak to the h = 2.5 peak is 1.09–1.27 (rules, median 1.24).
- **The peak is not converged at h = 0.75 mm.** It still rises between 1.0 and 0.75 mm (for example seed 4: 109.1 to 119.2 MPa), so the true value of the model's peak is not known from these meshes. This looks like a slowly converging local peak rather than a converged stress.
- **Peak location.** At h = 0.75 mm the peak element centroid is at x ≈ w (the inner face of the vertical arm) and y ≈ w + r (where the fillet meets that arm): the fillet tangent point (`results.txt`, last column). Whether this is a true concentration or a numerical singularity of the model at that junction was not tested.
- **The polygonal fillet is not the cause.** With 24, 96 and 384 facets the peak differs by at most 0.5 MPa at h ≤ 1.0 mm (`arc.txt`).
- **Reading for the earlier results.** On this evidence the h = 2.5 mm search mesh, not the rules, defines the narrow 2 mm region, so mass prices and gauge choices in the `simdesign-dfm` to `simdesign-gaugescatter` chain are mesh-conditional. The fine-mesh optimum itself was not searched.

## Limitations
- Only gauge-2 designs that were feasible on the coarse mesh were re-solved. Designs that fail on the coarse mesh but pass on a fine one were not looked for, and no fine-mesh optimum was computed, so the size of the bias on the minimum mass is unknown.
- One load case, one stress measure (element-centroid peak), no refinement near the fillet and no convergence order estimate (three to four mesh sizes and a non-converged peak).
- Cause of the slow convergence is not identified (candidates: a junction singularity, centroid sampling, the unstructured point-grid mesher). Not tested.
- Stylised 2D plane stress, assumed rule values and materials. Nothing was made or tested. Simulated results only.

## Next steps
Re-run the gauge search with a fine mesh or a patch/regularised stress measure (the repository already has `patch` in `measures.py`), check whether a feasible region exists at 2 mm at all, and graded refinement at the fillet tangent point to see whether the peak converges.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
