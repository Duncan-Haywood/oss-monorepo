# simdesign-bracket: can a parametric L-bracket be sized by finite elements for minimum mass and come out printable?

First milestone of the simulation-first design track (`PROJECTS.md`, track 5). A bracket written as code (arm width, inner fillet radius, depth) is analysed with 2D plane-stress finite elements, sized by three optimisers at an equal evaluation budget, checked for FDM printability and exported as an STL. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-bracket/

**Builds on.** scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>) for assembly and solving; SciPy's `differential_evolution` (Storn and Price, 1997, *Journal of Global Optimization* 11:341–359) as the optimiser. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. It is the base for later `simdesign-*` projects (topology optimisation, a fidelity comparison with beam theory, LLM-proposed designs).

## Method
- `src/simdesign_bracket/model.py`: L-shaped profile (80 mm arms, width `w`, inner fillet `r`), extruded by `b`. The top of the vertical arm is clamped; a 100 N downward load acts on the end face of the horizontal arm. P2 triangles, plane stress, mesh from a Delaunay triangulation of boundary and interior points that conforms to the filleted outline. Peak von Mises stress is taken at element centroids, excluding the zone within one arm width of the clamp (support artefact).
- `printability.py`: minimum wall (`min(w, b)` against 1.2 mm) and overhang length in two orientations (extrusion axis vertical: none; profile upright: edges steeper than 45 degrees).
- `stl.py`: binary STL by ear-clipping; test checks the STL volume against the analytic mass.
- Problem: minimise mass over `w` in [3, 25], `r` in [0, 15], `b` in [4, 30] mm subject to peak stress at most 20 MPa and tip deflection at most 4 mm.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib pytest
cd research/simdesign-bracket
python -m pytest -q tests          # 8 tests
python experiments/run.py          # writes experiments/results.txt, bracket.stl, bracket.png (about 2 minutes)
```

## Results (from `experiments/results.txt`)
| method (about 150 FE evaluations) | w (mm) | r (mm) | b (mm) | mass (g) | peak stress (MPa) | tip (mm) |
|---|---|---|---|---|---|---|
| random search | 19.85 | 13.73 | 7.31 | 25.59 | 17.48 | 2.63 |
| grid 5x5x6 | 19.50 | 7.50 | 9.20 | 31.39 | 16.39 | 2.40 |
| differential evolution (144) | 24.79 | 10.34 | 4.69 | 19.61 | 19.44 | 1.95 |

- Reference design (w 12, r 6, b 15): 33.2 g, 26.3 MPa and 7.6 mm: it fails both limits. The optimum is 41% lighter than it and passes.
- The stress limit is the active constraint; the deflection limit is not. One seed per method, so the ranking between optimisers is indicative only, not a benchmark.
- **Mesh dependence.** With a sharp inner corner (`r` = 0) peak stress grows without bound under refinement (24.9 to 43.0 MPa from h = 3 to 0.7 mm), as the theory of a re-entrant corner predicts, so no stress limit is meaningful without a fillet. With `r` = 6 it still rises, 22.7 to 26.3 MPa. The optimum rises from 19.44 MPa (the optimisation mesh) to 20.81 MPa at h = 0.5 mm: about 7% and just **over** the 20 MPa limit on the finest mesh. Tip deflection is converged to 3 digits.
- FE tip deflection agrees with a centre-line Euler–Bernoulli plus shear estimate to within 15% (a test; the first fidelity check, not a fidelity study).
- Printability of the optimum: minimum wall 4.7 mm (passes); flat on the bed no overhang; upright, the 80 mm underside of the horizontal arm overhangs and needs support. `experiments/bracket.stl` is the exported part.

## Limitations
- **Material properties and limits are assumed** typical values for an unfilled FDM thermoplastic (E 3000 MPa, nu 0.36, density 1.24 g/cm³, 20 MPa working stress), not measured or sourced. Printed parts are anisotropic; the model is isotropic.
- 2D plane stress: the thin optimum (b 4.7 mm for w 24.8 mm) has not been checked for out-of-plane or lateral-torsional buckling, nor the load introduction, and the clamp is idealised.
- Stress is mesh-sensitive at the fillet (above), so the optimum sits on a constraint that the model resolves only to about 7%. A safety margin or a converged mesh in the loop would be needed before trusting the number.
- Printability rules (1.2 mm wall, 45 degrees) are common rules of thumb, not tested on a printer. The `build123d` CAD route in the track's wording is not used: the part is a polygon extrusion written directly to STL.
- Simulated result only; nothing has been built or tested.

## Next steps
`simdesign-topopt`, then `simdesign-fidelity` (beam theory vs 2D vs 3D elements on this part). Stress-constrained optimisation with a converged or margin-adjusted stress.

## Owner steps
Print the STL in the owner's material, load it to failure, and replace the assumed material values with measured ones. Bill of materials: one printed part (about 20 g of filament); price not stated here.

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, matplotlib). Mounting bolts, if used, are not modelled.
