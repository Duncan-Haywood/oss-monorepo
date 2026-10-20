# simdesign-widerweb: do wider webs of the 2 mm laser-cut bracket stay feasible on fine meshes when the slenderness rule is relaxed?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "relax the slenderness rule" next step of `simdesign-meshconverge`. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load; a small, preliminary experiment.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-widerweb/

**Builds on.** `research/simdesign-meshconverge` (model, rules and optimiser copied into `src/simdesign_widerweb/` so the project stays self-contained; only the experiment script and tests differ), and through it `simdesign-pocketmesh`, `simdesign-gaugemesh` and `simdesign-dfm`. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser-cutting rules (steel sheet, fillet floor 0.2 mm), gauge (depth b) 2 mm, peak von Mises stress (limit 100 MPa, tip deflection limit 4 mm). `simdesign-meshconverge` could only scan w up to 16.0 mm because the assumed slenderness rule (w/b at most 8) fails above it. Here the script sets that limit to 12.5 (an arbitrary relaxation, so that w up to 20 mm passes the rule at b = 2 mm) and scans w = 15.0 to 20.0 mm in 0.5 mm steps at r = 8, 12 and 14 mm on meshes h = 1.5, 1.0 and 0.75 mm (198 solves). Mass is the process mass reported by the model.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-widerweb
python -m pytest -q tests          # 5 tests, a few seconds
python experiments/widerweb.py     # widerweb.txt, widerweb.json (about 25 seconds on 4 cores)
```

## Results (from `experiments/widerweb.txt`)
Lightest feasible web width in the scan (mass in g), 0.5 mm step:

| r (mm) | h = 1.5 | h = 1.0 | h = 0.75 |
|---|---|---|---|
| 8 | 16.5 (37.4) | 17.0 (38.4) | 17.0 (38.4) |
| 12 | 16.0 (36.7) | 16.5 (37.7) | 16.5 (37.7) |
| 14 | 16.0 (36.8) | 16.5 (37.8) | 16.0 (36.8) |

Every width from the listed one up to 20.0 mm is feasible in each row. The lowest peak stress in the scan is at w = 20.0 mm: 68.2, 74.1 and 74.2 MPa at r = 8 mm; 63.3, 67.5 and 68.4 MPa at r = 12 mm; 62.5, 65.9 and 65.8 MPa at r = 14 mm (h = 1.5, 1.0, 0.75 mm). Tip deflection there is 0.14 to 0.15 mm, far under the 4 mm limit.

- **Wider webs are feasible on every mesh tried.** The empty feasible sets of `simdesign-meshconverge` at h = 1.0 and 0.5 mm were caused by the window cut off at 16.0 mm, not by the stress measure alone: once the rule allows it, a width of 16.0 to 17.0 mm and wider passes at h = 0.75 mm.
- **Refinement raises the lightest feasible width by one scan step.** From h = 1.5 to 1.0 mm the lightest feasible w rises by 0.5 mm at all three radii (about 1 g, or 3%). From 1.0 to 0.75 mm it is unchanged at r = 8 and 12 mm and falls back by 0.5 mm at r = 14 mm, so with a 0.5 mm step the shift is not resolved beyond "about one step".
- Stress at fixed w rises with refinement (for example w = 20 mm, r = 8 mm: 68.2, 74.1, 74.2 MPa), but the three-mesh sequence is too short to say whether it converges.

## Limitations
- The relaxed slenderness limit (12.5) is arbitrary. The rule stands in for out-of-plane buckling, which the 2D model cannot see, so whether a 16 to 20 mm web of 2 mm sheet buckles is not tested here. These designs are unvalidated; the finding is about the model's stress measure only.
- 0.5 mm step in w, three radii, three meshes, one gauge, one load, the peak measure; no optimiser run. The mesh h = 0.5 mm of `simdesign-meshconverge` was not repeated.
- Stylised 2D plane stress, assumed rule values and materials. Nothing was made or tested. Simulated results only.

## Next steps
Add a buckling check (a plate-buckling estimate or a shell model) to replace the arbitrary slenderness limit; rerun the scan with a 0.1 mm step near the feasible edge; run the optimiser at h = 1.0 mm.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
