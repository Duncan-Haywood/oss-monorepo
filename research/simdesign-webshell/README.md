# simdesign-webshell: do closed-form lateral-torsional buckling factors of the laser-cut bracket arms agree with a 3D eigenbuckling model?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "check the closed forms against a 3D or shell eigenbuckling model in scikit-fem" next step of `simdesign-webbuckle`. Produced with AI assistance (Claude). A stylised, preliminary comparison of two idealised models; nothing was made or tested, and the mesh is not fully converged.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-webshell/

**Builds on.** `simdesign-webbuckle` (the closed forms; same L-bracket: arms of length 80 mm, width w, sheet thickness b = 2 mm, steel E = 200 GPa, ν = 0.30, 100 N tip load). The closed forms are the classical cantilever lateral-torsional results of S. P. Timoshenko and J. M. Gere, *Theory of Elastic Stability*, 2nd ed., McGraw-Hill, 1961 (see `simdesign-webbuckle` for how they were checked). The finite-element method is standard linear (eigenvalue) buckling: a static solve gives the pre-stress, a geometric stiffness matrix is built from it, and a generalised eigenproblem gives the critical load factor (see e.g. K.-J. Bathe, *Finite Element Procedures*, Prentice Hall, 1996, on linearised buckling; I did not have it to hand, so the page-level reference is unchecked). Implemented with scikit-fem: T. Gustafsson and G. D. McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52), 2369, 2020. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
`src/simdesign_webshell/eigbuckle.py` meshes one arm as a prismatic bar (length l, in-plane width w, thickness b) with quadratic hexahedra, clamped on x = 0 (all displacement components fixed). It solves the static problem for a unit end load, evaluates the stress at the quadrature points, assembles the geometric stiffness ∫ ∇v · σ · ∇u dV, and finds the smallest positive eigenvalue of K φ = λ(−Kg) φ with a sparse ARPACK solve. Two load cases mirror the closed forms:

- horizontal arm: cantilever of length L − w with a unit tip force in the plane of the web, spread uniformly over the end face (closed form P<sub>cr</sub> = 4.013 √(E I<sub>y</sub> G J)/l²);
- vertical arm: cantilever of length H = 80 mm with a unit end moment from a linear normal traction σ<sub>xx</sub> = M y/I<sub>z</sub> (closed form M<sub>cr</sub> = π/(2l) √(E I<sub>y</sub> G J)).

Validation of the geometric-stiffness assembly: the same code on the clamped-free Euler column (axial load, weak axis, w = 8, b = 2, l = 72 mm) gives a critical load within 2 % of π²EI/(4l²) (test `test_euler_column_matches_to_2_percent`).

## Reproduce
```bash
pip install numpy scipy scikit-fem pytest
cd research/simdesign-webshell
python -m pytest -q tests        # 3 tests, about 20 s
python experiments/scan.py       # about 5 min; writes experiments/scan.txt
```

## Results (from `experiments/scan.txt`, b = 2 mm)
Ratio of the finite-element critical load to the closed form, on a coarse mesh (18×2×1 elements) and a finer one (36×4×1):

| w (mm) | horizontal arm, coarse / fine | vertical arm, coarse / fine |
|---|---|---|
| 8 | 1.075 / 1.059 | 1.021 / 1.005 |
| 16 | 1.162 / 1.148 | 1.021 / 1.007 |
| 25 | 1.302 / 1.291 | 1.021 / 1.011 |

Governing safety factor at F = 100 N from the fine-mesh model (vertical arm in all three cases): 3.15, 6.97 and 11.85 for w = 8, 16, 25 mm, against 3.14, 6.93 and 11.72 from the closed forms of `simdesign-webbuckle`.

- **The vertical arm, which governs, agrees with the closed form to about 1 % on the fine mesh** (the load case is close to the one the formula assumes).
- **The horizontal-arm closed form is conservative, and more so for wider webs**: the 3D model gives a critical load 6 % higher at w = 8 mm and 29 % higher at w = 25 mm (fine mesh). A plausible cause, not tested here, is that the thin-bar formula leaves out the cross-section's finite width (shear deformation, restrained warping at the clamp) which matters more as w/l grows from 0.11 to 0.45.
- **The conclusion of `simdesign-webbuckle` stands under this model**: at the 2 mm gauge buckling does not limit w = 16–25 mm, and the closed forms did not overstate the margin for these cases. The 1 mm and 3 mm gauges were not rerun.

## Limitations
- Mesh not converged: refining from 18×2×1 to 36×4×1 moved the ratios by 1.0 to 1.6 percentage points, all in the same direction (down), so the fine-mesh values are probably still slightly high; no extrapolation was done and the thickness direction has a single element layer in both meshes.
- Load introduction is idealised (uniform shear or linear normal traction on the end face; full clamp including warping and Poisson restraint), so the comparison is between the formula's boundary conditions and a nearby but different set, not an exact like-for-like test. The load is dead (no follower effect) and the real bracket's corner flexibility and arm interaction are not modelled.
- Ideal elastic material, perfect geometry: no imperfections, residual stress from cutting or plasticity, so critical loads here are upper bounds on real sheet behaviour and not margins. One gauge (2 mm), three widths, one material.
- Linear buckling only: no post-buckling or load-path nonlinearity. Simulated only; nothing was fabricated or tested.

## Next steps
Converge the mesh (more layers through the thickness, 72×8×2) and extrapolate the ratios; apply the clamp as a flexible corner by modelling the whole L-shaped bracket as one 3D body; rerun at b = 1 mm and 3 mm; replace the `MAX_SLENDER` guard in the bracket chain with a lower bound on the governing factor and rerun the optimiser at b = 1 mm.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem; pytest for tests). The material, load and boundary conditions are assumptions; sheet-metal test data would replace them.
