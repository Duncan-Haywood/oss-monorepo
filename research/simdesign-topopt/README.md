# simdesign-topopt: a Python reproduction of Sigmund's 99-line topology optimisation, taken through to a printable STL

Second milestone of the simulation-first design track (`PROJECTS.md`, track 5). It reimplements the SIMP compliance-minimisation method of Sigmund's 99-line code on a Q4 grid, checks it against analytic and finite-difference tests, runs the cantilever and half-MBB problems, ablates the filter and the penalty, and converts the resulting density field into a connected, mirrored, extruded STL. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-topopt/

**Builds on.** Sigmund (2001), "A 99 line topology optimization code written in Matlab", *Structural and Multidisciplinary Optimization* 21(2):120–127, <https://doi.org/10.1007/s001580050176>: the method, the filter and the OC update. Bendsøe (1989), "Optimal shape design as a material distribution problem", *Structural Optimization* 1:193–202 (SIMP). Andreassen, Clausen, Schevenels, Lazarov and Sigmund (2011), "Efficient topology optimization in MATLAB using 88 lines of code", *Structural and Multidisciplinary Optimization* 43:1–16 (vectorised assembly, which this code follows in spirit). Sigmund and Petersson (1998), "Numerical instabilities in topology optimization: a survey on procedures dealing with checkerboards, mesh-dependencies and local minima", *Structural Optimization* 16:68–75. This is an independent re-implementation: no code was copied, and the published codes were not run, so nothing here is checked against their printed numbers. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. It follows `simdesign-bracket`.

## Method
- `src/simdesign_topopt/simp.py`: unit square Q4 plane-stress elements (closed-form 8×8 matrix, ν = 0.3), SIMP law E(x) = E_min + x^p (1 − E_min) with p = 3, E_min = 1e-9, sparse assembly and solve, compliance and its exact sensitivity, the 99-line sensitivity filter (weights max(0, r_min − distance)), optimality-criteria update with bisection on the multiplier and move limit 0.2, stop when the largest density change is below 0.01 (or 200 iterations). Problems: cantilever (left edge clamped, unit downward load at mid-height on the right) and half-MBB beam (symmetry plane on the left, roller bottom right, unit load top left).
- `export.py`: threshold the density at the quantile that keeps the target volume, keep the largest 4-connected component, report the shortest solid run (an upper bound on the thinnest bar), mirror about the symmetry plane, extrude each solid pixel and write boundary quads to a binary STL (1 pixel = 1 mm, 5 mm thick). A test checks the STL volume against pixels × thickness.
- Units are dimensionless (E_0 = 1, unit load, unit element): compliance values are comparable inside this README only.

## Reproduce
```bash
pip install numpy scipy matplotlib pytest
cd research/simdesign-topopt
python -m pytest -q tests          # 7 tests
python experiments/run.py          # writes experiments/results.txt, mbb.png, mbb.stl (a few seconds)
```

## Results (from `experiments/results.txt`)
| problem | grid | volume fraction | r_min | compliance (start → end) | iterations |
|---|---|---|---|---|---|
| cantilever | 32×20 | 0.4 | 1.2 | 351.9 → 52.4 | 28 |
| half-MBB | 60×20 | 0.5 | 1.5 | 1007.0 → 203.3 | 94 |

Both converge to the familiar truss-like layouts (`experiments/mbb.png`). Ablations on the half-MBB (single deterministic runs):

| filter | p | compliance | grey elements (0.1 < x < 0.9) | checkerboard 2×2 cells |
|---|---|---|---|---|
| sensitivity | 3 | 203.3 | 21.2% | 0.0% |
| none | 3 | 203.2 | 1.6% | 11.5% |
| sensitivity | 1 | 164.8 | 71.0% | 0.0% |
| none | 1 | 164.4 | 67.7% | 0.0% |

- Without the filter the penalised design is almost black and white but 11.5% of 2×2 cells are checkerboards, a known instability (Sigmund and Petersson 1998); the filter removes them and leaves a fifth of the elements grey. Compliance is the same to 0.03%: checkerboards are not visibly cheating on this small grid.
- p = 1 gives a variable-thickness plate, about 19% stiffer than the penalised designs at the same volume and mostly grey: penalisation is what buys a manufacturable layout.
- **Mesh refinement** at a fixed physical filter radius (2.5% of the beam length): compliance 190.9 (30×10), 203.3 (60×20), 207.1 (120×40). The coarsest grid has r_min < 1 element, so the filter does nothing there and the design is 19.5% checkerboard, which makes it spuriously stiff; the two finer grids are checkerboard-free and 1.9% apart. Not a full convergence study (three grids, one problem).
- **To a part.** Thresholding the 60×20 field at the 50% volume quantile gives one connected body (600 px) with compliance 189.5, 6.8% lower than the grey field's 203.3. The lower value is expected, since the grey field's intermediate densities are penalised, but it is a re-analysis with the same E_min = 0.001 void stiffness rather than a new optimisation, so it is not a guarantee for other problems. The shortest solid run is 2 px, so on a printer a 1 px = 1 mm scale gives 2 mm bars, above the common 1.2 mm minimum wall used in `simdesign-bracket`. The mirrored 120×20×5 mm beam (`experiments/mbb.stl`, 6124 triangles) has STL volume 6000 mm³, equal to pixels × thickness.

## Tests
Element matrix is symmetric with exactly three zero modes; a one-row bar matches Hooke's law within 0.15 in 6; the analytic sensitivity matches central finite differences to 5 places at three elements; OC holds the volume to 0.2% and lowers compliance; threshold, component, feature and STL-volume checks.

## Limitations
- 2D plane stress on a regular grid with unit dimensionless properties. No physical material, load or safety factor, so the printed beam's real stiffness or strength is not predicted. A real part needs a thickness-dependent 3D check.
- Compliance minimisation only: no stress, buckling or fatigue constraint (stress is the active limit in `simdesign-bracket`).
- The density filter and Heaviside projection that give mesh-independent minimum feature size are not implemented; the sensitivity filter used here leaves grey elements and the thresholded part has a pixel-staircase boundary (no smoothing or CAD fitting). "Turn the density field into printable CAD" is met as an extruded pixel STL, not as smooth B-rep geometry.
- Printability is only: one connected component and a run-length bound on feature size. Overhangs and orientation are not checked, and the 2 mm figure is a bound on the thinnest bar rather than a measured minimum width.
- One run per setting; local minima are not explored. Nothing checks the results against the published figures or codes.
- Simulated result only; nothing has been built or tested.

## Next steps
`simdesign-fidelity` (beam theory vs 2D vs 3D elements on this and the bracket); a density filter with Heaviside projection and a minimum-feature check; a 3D extension; `simdesign-dfm` constraints from the shop in track 1.

## Owner steps
Print `experiments/mbb.stl` (about 6 cm³, under 10 g of filament; no price stated here) and load it in three-point bending to compare with a 3D model once a material is chosen.

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, matplotlib). No bolts or hardware.
