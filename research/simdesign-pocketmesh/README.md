# simdesign-pocketmesh: do the isolated feasible pockets of the gauge-2 bracket survive mesh refinement?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the first "next step" of `simdesign-gaugebasins`: repeat the web-width scan on finer meshes. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load; a small, preliminary experiment.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-pocketmesh/

**Builds on.** `research/simdesign-gaugebasins` (model, rules and optimiser copied into `src/simdesign_pocketmesh/` so the project stays self-contained; only the experiment script and tests differ), and through it `simdesign-gaugemesh` and `simdesign-dfm`. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser-cutting rules (steel sheet, fillet floor 0.2 mm), gauge 2 mm, peak von Mises stress (limit 100 MPa, tip deflection limit 4 mm). `experiments/meshscan.py` scans the web width w from 13.5 to 16.5 mm in 0.1 mm steps at fixed fillet radius r = 8, 10, 12 and 14 mm, on meshes of h = 2.5, 2.0 and 1.5 mm, and records feasibility and peak stress for each of the 372 points.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-pocketmesh
python -m pytest -q tests          # 5 tests, a few seconds
python experiments/meshscan.py     # meshscan.txt, meshscan.json (under a minute on 4 cores)
```

## Results (from `experiments/meshscan.txt` and `meshscan.json`)
Smallest feasible w (mm) and feasible w below 15.4 mm, by mesh size h:

| r (mm) | h = 2.5: first feasible; below 15.4 | h = 2.0: first feasible; below 15.4 | h = 1.5: first feasible; below 15.4 |
|---|---|---|---|
| 8 | 15.7; none | 15.6; none | 15.8; none |
| 10 | 14.6; 14.6, 14.7 | 15.2; 15.2, 15.3 | 15.7; none |
| 12 | 14.8; 14.8 | 15.1; 15.1–15.3 | 15.7; none |
| 14 | 14.4; 14.4, 14.9 | 15.0; 15.0–15.3 | 15.6; none |

- **The h = 2.5 mm pockets disappear at h = 1.5 mm.** The isolated feasible values below 15.4 mm at r ≥ 10 mm (the pockets reported by `simdesign-gaugebasins`; reproduced here at h = 2.5) are absent at h = 1.5 mm for every r scanned.
- **The feasible boundary moves up as the mesh is refined.** The smallest feasible w rises from 14.4–14.8 mm (h = 2.5, r ≥ 10) to 15.0–15.2 mm (h = 2.0) to 15.6–15.7 mm (h = 1.5). At h = 2.0 the low-w feasible values are contiguous for r = 12 and 14 mm, not isolated. Between h = 2.5 and 1.5 the boundary has shifted by about 1 mm in w, and it has not stopped moving, so h = 1.5 is not shown to be converged.
- **The feasible set at h = 1.5 is still not perfectly contiguous.** r = 10 mm: 15.7, 15.8, 16.0 (15.9 fails); at r = 12 mm the peak stress is not monotone in w on any mesh (for example 105.8, 100.2, 92.1 MPa at w = 15.0, 15.4, 15.8 on h = 2.5, against a 100 MPa limit), so feasibility near the limit is sensitive to mesh details.
- **Reading.** This is consistent with the hypothesis in `simdesign-gaugebasins` that the lower mass group is an artefact of the stress evaluation on a coarse mesh, and with the finer-mesh result of `simdesign-gaugemesh`. It is not a proof: one gauge, one load, and a peak-stress measure that depends on the mesh near the fillet.

## Limitations
- Gauge 2 mm only, one process, one load, the peak stress measure, four values of r and a 0.1 mm step in w. No search was run on the finer meshes, so the effect on the optimiser's answer is inferred from the feasible boundary, not measured.
- Three mesh sizes do not establish convergence; the feasible boundary was still moving between 2.0 and 1.5 mm. The mesh-noise interpretation (non-monotone peak stress) is read off a few rows of `meshscan.json`, not tested.
- Stylised 2D plane stress, assumed rule values and materials. Nothing was made or tested. Simulated results only.

## Next steps
Extend the scan to h = 1.0 and 0.75 mm to see whether the boundary converges; rerun the differential-evolution search at h = 1.5 mm and report the mass of its best feasible design against the 2.5 mm result.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
