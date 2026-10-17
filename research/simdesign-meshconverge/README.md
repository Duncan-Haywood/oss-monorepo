# simdesign-meshconverge: does the gauge-2 feasible boundary converge when the mesh is refined to 0.5 mm?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the first "next step" of `simdesign-pocketmesh`: scan the web width on finer meshes. A negative result for the peak-stress measure on the 2 mm laser-cut bracket. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load; a small, preliminary experiment.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-meshconverge/

**Builds on.** `research/simdesign-pocketmesh` (model, rules and optimiser copied into `src/simdesign_meshconverge/` so the project stays self-contained; only the experiment script and tests differ), and through it `simdesign-gaugebasins`, `simdesign-gaugemesh` and `simdesign-dfm`. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser-cutting rules (steel sheet, fillet floor 0.2 mm), gauge (depth b) 2 mm, peak von Mises stress (limit 100 MPa, tip deflection limit 4 mm). `experiments/meshscan.py` scans web width w from 15.0 to 17.0 mm in 0.1 mm steps at fixed fillet radius r = 8, 10, 12 and 14 mm, on meshes of h = 1.5, 1.0, 0.75 and 0.5 mm (336 points). The h = 1.5 mm row repeats the finest mesh of `simdesign-pocketmesh` over a shifted window.

The copied slenderness rule (w/b at most 8) fails for w > 16.0 mm at b = 2 mm, so the finite-element solve is skipped there and no stress is recorded. The usable window is therefore w = 15.0 to 16.0 mm (11 points per r and h); the 16.1 to 17.0 mm points carry no information.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-meshconverge
python -m pytest -q tests          # 6 tests, about 10 seconds
python experiments/meshscan.py     # meshscan.txt, meshscan.json (a few minutes on 4 cores)
```

## Results (from `experiments/meshscan.txt` and `meshscan.json`)
Feasible widths in w = 15.0 to 16.0 mm, by mesh size h (limit 100 MPa):

| r (mm) | h = 1.5 | h = 1.0 | h = 0.75 | h = 0.5 |
|---|---|---|---|---|
| 8 | 15.8 | none | none | none |
| 10 | 15.7, 15.8, 16.0 | none | none | none |
| 12 | 15.7 to 16.0 | none | none | none |
| 14 | 15.6 to 16.0 | none | 16.0 | none |

Lowest peak von Mises stress (MPa) over the usable window, with the width where it occurs (limit 100 MPa):

| r (mm) | h = 1.5 | h = 1.0 | h = 0.75 | h = 0.5 |
|---|---|---|---|---|
| 8 | 99.9 (w=15.8) | 110.4 (w=16.0) | 108.8 (w=16.0) | 113.9 (w=16.0) |
| 10 | 98.2 (w=16.0) | 106.1 (w=16.0) | 104.3 (w=16.0) | 108.7 (w=16.0) |
| 12 | 93.8 (w=16.0) | 102.0 (w=15.6) | 101.7 (w=16.0) | 105.6 (w=16.0) |
| 14 | 91.2 (w=16.0) | 100.7 (w=16.0) | 99.5 (w=16.0) | 103.0 (w=16.0) |

- **No design is feasible at h = 0.5 mm.** The feasible set found on h = 1.5 mm (1 to 5 widths per radius) is empty at h = 1.0 and 0.5 mm for every r scanned. At h = 0.75 mm a single point, r = 14 mm and w = 16.0 mm, passes at 99.5 MPa.
- **The peak stress keeps rising slowly with refinement.** From h = 1.5 to 0.5 mm the lowest peak stress rises by 11 to 14 percent (99.9 to 113.9 MPa at r = 8 mm; 91.2 to 103.0 MPa at r = 14 mm). From h = 1.0 to 0.5 mm the change is small and not monotone (r = 14: 100.7, 99.5, 103.0), so the peak looks to be approaching a plateau slightly above the limit, but this is read off three points and is not shown.
- **The window is cut off by a rule, not by stress.** The lowest stress is at or next to w = 16.0 mm in most rows, so it is still falling with w at the window edge, so a wider web might become feasible on fine meshes; this scan cannot say, because the slenderness rule forbids w above 16 mm at b = 2 mm.
- **Reading.** Consistent with `simdesign-pocketmesh` and `simdesign-gaugemesh`: the apparently feasible gauge-2 designs found on coarse meshes are not feasible under the peak-stress measure at 0.5 to 1.0 mm. It does not show that no feasible gauge-2 design exists.

## Limitations
- Gauge 2 mm, one process, one load, the peak stress measure, four values of r, a 0.1 mm step and a window of 1 mm in w. No optimiser run was made on the fine meshes, so the effect on the search answer is inferred, not measured. The second "next step" of `simdesign-pocketmesh` (differential evolution at h = 1.5 mm) is still open.
- Whether the peak stress converges, or grows slowly without bound at the near-sharp fillet floor (0.2 mm), is not decided by four mesh sizes.
- Stylised 2D plane stress, assumed rule values and materials. Nothing was made or tested. Simulated results only.

## Next steps
Rerun the search at h = 1.0 mm to get the best feasible mass, or relax the slenderness rule (or use a patch-averaged measure as in `simdesign-patchstress`) to see whether wider webs are feasible on fine meshes.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
