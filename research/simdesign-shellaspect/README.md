# simdesign-shellaspect: at what bar slenderness does the 3D eigenbuckling model agree with the slender-beam closed form?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "vary l/w to see when the gap to the closed form closes" next step of `simdesign-shellorder`. Produced with AI assistance (Claude). A stylised, preliminary scan of one idealised bar; nothing was made or tested. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Builds on.** `simdesign-shellorder` (model code copied unchanged: linear eigenbuckling of a 3D quadratic-hexahedron bar in scikit-fem, clamped at x = 0, steel E = 200 GPa, ν = 0.30, tip shear load in the width direction). Closed form: the cantilever lateral-torsional result of S. P. Timoshenko and J. M. Gere, *Theory of Elastic Stability*, 2nd ed., McGraw-Hill, 1961, as used in `simdesign-webbuckle`. scikit-fem: T. Gustafsson and G. D. McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52), 2369, 2020.

## Method
Cross-section fixed at w = 8 mm, b = 2 mm. The length is 24, 48, 96 and 192 mm (l/w = 3, 6, 12, 24). Mesh: 4×2 elements across the section and 2 mm elements along the length (nx = l/2), i.e. the 12×4×2 mesh of `simdesign-shellorder` stretched along x. The critical tip shear load from the lowest eigenvalue is divided by the closed form.

## Reproduce
```bash
pip install numpy scipy scikit-fem pytest
cd research/simdesign-shellaspect
python -m pytest -q tests          # 2 tests, about 1 min
python experiments/scan.py         # about 6 min on one core; writes scan.txt
```

## Results (from `experiments/scan.txt`)
| l (mm) | l/w | FE critical load (N) | closed form (N) | FE / closed form |
|---|---|---|---|---|
| 24 | 3 | 9686.5 | 8460.6 | 1.1449 |
| 48 | 6 | 2270.8 | 2115.2 | 1.0736 |
| 96 | 12 | 548.9 | 528.8 | 1.0381 |
| 192 | 24 | 134.9 | 132.2 | 1.0207 |

- The excess over the closed form (0.145, 0.074, 0.038, 0.021) roughly halves each time the length doubles; excess × l/w is 0.43, 0.44, 0.46, 0.50. So the gap shrinks about as w/l and the two models converge for a slender bar. This is consistent with the short-bar explanation floated in `simdesign-shellorder` (shear deformation, clamp warping restraint), but this scan does not separate those two effects, so it is a consistency check, not a demonstration.
- The l/w = 3 row reproduces `simdesign-shellorder`'s 12×4×2 value (9686.5 N) exactly.
- The slow drift of excess × l/w upward at the longer lengths could be the fixed cross-section mesh (discretisation error does not shrink as the bar lengthens) or the closed form's own approximations; not tested. At l/w = 24 the 2.1% gap probably includes some mesh error: the earlier study found the 12×4×2 mesh about 0.6% above the finest at l/w = 3.

## Limitations
One cross-section, one load case, one mesh per length, no refinement study at l/w ≥ 6, no extrapolation. The clamp is a rigid face, not a bracket corner. Steel properties and the closed form's torsion constant are assumptions carried from earlier projects.

## Next steps
Refine the cross-section mesh at l/w = 12 to split mesh error from model difference; add a shear-deformable (Timoshenko) beam estimate to test the shear explanation; model the whole L-bracket as one 3D body.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem; pytest). Material, load and boundary conditions are assumptions.
