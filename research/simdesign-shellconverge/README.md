# simdesign-shellconverge: does refining the 3D eigenbuckling mesh change how the closed-form bracket-arm buckling factors compare?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "converge the mesh" next step of `simdesign-webshell`. Produced with AI assistance (Claude). A stylised, preliminary mesh study of an idealised model; nothing was made or tested. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-shellconverge/

**Builds on.** `simdesign-webshell` (same model, code copied unchanged: L-bracket arms of length 80 mm, width w, thickness b = 2 mm, steel E = 200 GPa, ν = 0.30, 100 N tip load; linear eigenbuckling of a 3D quadratic-hexahedron model in scikit-fem, clamped at x = 0). Closed forms: the classical cantilever lateral-torsional results of Timoshenko and Gere, *Theory of Elastic Stability*, 2nd ed., McGraw-Hill, 1961, as used in `simdesign-webbuckle`. scikit-fem: T. Gustafsson and G. D. McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52), 2369, 2020.

## Method
For each web width w = 8, 16, 25 mm and each arm (horizontal: tip shear, length 80 − w; vertical: end moment, length 80), the critical load is computed on five meshes (nx along the length × ny across w × nz through b): the base mesh 36×4×1 (the fine mesh of `simdesign-webshell`); the base refined in one direction only (36×4×2 "thick2", 72×4×1 "len72", 36×8×1 "wid8"); and all three together (72×8×2, "all"). Each ratio is FE critical load / closed form. `experiments/analyze.py` tabulates the change from the base mesh per direction and the sum of the three single-direction changes.

## Reproduce
```bash
pip install numpy scipy scikit-fem pytest
cd research/simdesign-shellconverge
python -m pytest -q tests          # 2 tests, about 40 s
python experiments/scan.py         # about 1.5 h on one core (the 72x8x2 solves take about 13 min each); writes scan.txt
python experiments/analyze.py      # writes summary.txt
```
`scan.txt` was produced by running `scan.py` separately per width (in parallel, one process each). The w = 8 run hit its time limit before the last two vertical-arm meshes, which were rerun with `ONLY=vertical:wid8,vertical:all python experiments/scan.py 8`; the rows were then concatenated.

## Results (from `experiments/scan.txt` and `summary.txt`; FE / closed-form ratio)
| arm | w (mm) | base | thick2 | len72 | wid8 | all (72×8×2) | all − base |
|---|---|---|---|---|---|---|---|
| horizontal | 8 | 1.0593 | 1.0498 | 1.0587 | 1.0560 | 1.0463 | −0.0130 |
| horizontal | 16 | 1.1476 | 1.1420 | 1.1470 | 1.1413 | 1.1353 | −0.0123 |
| horizontal | 25 | 1.2912 | 1.2869 | 1.2905 | 1.2842 | 1.2792 | −0.0120 |
| vertical | 8 | 1.0045 | 0.9960 | 1.0036 | 1.0014 | 0.9924 | −0.0121 |
| vertical | 16 | 1.0069 | 1.0023 | 1.0061 | 1.0012 | 0.9962 | −0.0107 |
| vertical | 25 | 1.0110 | 1.0080 | 1.0103 | 1.0053 | 1.0016 | −0.0094 |

- **Every refinement lowers the critical load**, as expected for a stiffness-based model with too few elements, and the full refinement moves the ratios by 0.9 to 1.3 percentage points.
- **Thickness and width refinement dominate**; refining the length changes the ratios by less than 0.1 point. For w = 8 the thickness effect is largest (about −0.9 point), for w = 25 the width effect is (−0.6 to −0.7 point).
- **The sum of the three single-direction changes matches the all-directions change to within 0.1 point** (e.g. vertical, w = 8: −0.0125 vs −0.0121), so the effects are close to additive here.
- **The governing vertical arm** lands at 0.992, 0.996 and 1.002 of the closed form on the finest mesh, i.e. agreement within about 1%, with the sign of the small difference depending on w. The `simdesign-webshell` safety factors at F = 100 N (3.15, 6.97, 11.85 on the base mesh) therefore fall by about 1% to roughly 3.12, 6.90 and 11.74 (closed forms times the finest-mesh ratios, using the rounded closed-form values 3.14, 6.93, 11.72 from `simdesign-webbuckle`). The conclusion of `simdesign-webbuckle` is unchanged.
- **The horizontal-arm closed form stays conservative** (finest-mesh ratios 1.046, 1.135, 1.279 for w = 8, 16, 25 mm), so the conservatism reported in `simdesign-webshell` is not a mesh artefact.

## Limitations
- Two levels per direction only: the changes show the direction and size of the discretisation effect, but no convergence order is estimated and no extrapolated limit is claimed. The finest mesh is probably still slightly high; whether the vertical-arm ratio at w = 25 mm (1.002) would settle below 1 is not known.
- Everything else in `simdesign-webshell`'s limitations still applies: idealised load introduction and full clamp, dead load, ideal elastic material and geometry, one gauge (2 mm), one material, no corner flexibility, linear buckling only. Not run at b = 1 or 3 mm.
- Elapsed times in `scan.txt` are from a shared 4-core container with several runs in parallel; use them only as rough sizes.
- Simulated only; nothing was fabricated or tested.

## Next steps
Add a third refinement level in thickness and width on a short bar to estimate the convergence order; model the whole L-shaped bracket as one 3D body to replace the clamp; rerun at b = 1 mm and 3 mm; replace the `MAX_SLENDER` guard in the bracket chain with a lower bound on the governing factor.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem; pytest for tests). Material, load and boundary conditions are assumptions; sheet-metal test data would replace them.
