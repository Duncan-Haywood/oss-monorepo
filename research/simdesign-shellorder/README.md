# simdesign-shellorder: at what rate does the 3D eigenbuckling model converge under uniform mesh refinement?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "third refinement level" next step of `simdesign-shellconverge`. Produced with AI assistance (Claude). A stylised, preliminary study of one idealised short bar; nothing was made or tested. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-shellorder/

**Builds on.** `simdesign-shellconverge` (model code copied unchanged: linear eigenbuckling of a 3D quadratic-hexahedron bar in scikit-fem, clamped at x = 0, steel E = 200 GPa, ν = 0.30, tip shear load in the width direction). Closed form: the cantilever lateral-torsional result of Timoshenko and Gere, *Theory of Elastic Stability*, 2nd ed., McGraw-Hill, 1961, as used in `simdesign-webbuckle`. scikit-fem: T. Gustafsson and G. D. McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52), 2369, 2020. Richardson extrapolation and observed order: standard practice, e.g. P. J. Roache, *Verification and Validation in Computational Science and Engineering*, Hermosa, 1998.

## Method
A short bar (l = 24, w = 8, b = 2 mm, chosen so the finest mesh solves in minutes) is meshed with three uniformly refined hexahedral meshes, each halving the element size in all directions: 6×2×1, 12×4×2, 24×8×4 (nx × ny × nz). The critical tip shear load is taken from each. With differences d1 (coarse to mid) and d2 (mid to fine), the observed order is p = log2(d1/d2) and the Richardson limit is f_fine − d2/(2^p − 1). `experiments/analyze.py` computes both.

## Reproduce
```bash
pip install numpy scipy scikit-fem pytest
cd research/simdesign-shellorder
python -m pytest -q tests          # 1 test, about 40 s
python experiments/scan.py         # about 15 min on one core (the 24x8x4 solve takes about 13 min); writes scan.txt
python experiments/analyze.py      # writes summary.txt
```
The committed `scan.txt` holds the numbers printed by those three solves, which were run through the same `critical_loads` call in one script before `scan.py` was written; `scan.py` itself was not re-run end to end.

## Results (from `experiments/scan.txt` and `summary.txt`)
| mesh | FE critical load (N) | FE / closed form |
|---|---|---|
| 6×2×1 | 10021.6 | 1.1845 |
| 12×4×2 | 9686.5 | 1.1449 |
| 24×8×4 | 9630.0 | 1.1382 |

Closed form: 8460.6 N. Differences 335.0 and 56.6 N give an observed order p ≈ 2.57 and a Richardson limit of 9618.5 N (ratio 1.137); the finest mesh is about 0.12% above that limit.

- The sequence decreases monotonically and the differences shrink by a factor of about 5.9, so the three levels are in the asymptotic-looking regime to the extent three points can show. One triple cannot confirm the order; 2.57 sits between the 2 and 4 one might expect from quadratic elements with a singular or non-smooth clamp, which this study does not explain.
- The FE and the closed form differ by about 14% even in the limit. This gap is not a discretisation error: the closed form is a slender-beam formula and this bar is short (l/w = 3), so shear deformation and the clamp's warping restraint plausibly matter. That attribution is a hypothesis, untested here.

## Limitations
Single geometry, single load case, one mesh triple, uniform refinement only; the clamp face singularity is not treated. The Richardson limit assumes asymptotic convergence. Material and load are assumptions.

## Next steps
Add a fourth level (48×16×8, memory permitting) or a different refinement ratio to test the order; vary l/w to see when the gap to the closed form closes; model the whole L-bracket as one 3D body.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem; pytest). Material, load and boundary conditions are assumptions.
