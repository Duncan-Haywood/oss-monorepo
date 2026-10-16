# simdesign-minwall: does relaxing the 1.2 mm minimum wall open thinner sheet gauges for the laser-cut bracket?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "relax or justify the 1.2 mm minimum wall and rerun b = 1 mm" next step of `simdesign-bucklebound`. Produced with AI assistance (Claude). Stylised; the buckling factor is an ideal-bar closed form that is not validated for thin sheet; preliminary.

**Builds on.** `simdesign-bucklebound` (bracket model, rule sets, optimiser and the lateral-torsional buckling closed forms, copied here so the project is self-contained; the only code change is that the tests and experiment set `dfm.MIN_WALL_ANY`). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser-cut steel sheet (E = 200 GPa, 100 MPa working stress, tip limit 4 mm, F = 100 N, arms 80 mm, assumed rule values as in `simdesign-dfm`). Sheet gauge b in {0.8, 1.0, 1.5} mm, minimum wall (`MIN_WALL_ANY`, applied to the sheet thickness and the web) in {1.2, 1.0, 0.8} mm, buckling-factor floor in {3, 1}. For each cell the optimiser (SciPy differential evolution, population 8, 25 generations, seeds 0 to 2, mesh h = 1.5 mm, peak von Mises) searches w in [2, 25] mm and r in [0, 15] mm for the least mass. Reported: the lightest feasible design over the three seeds. 54 optimiser runs. `experiments/diagnose.py` additionally scans a coarse (w, r) grid at b = 1.0 to name the rule that binds.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-minwall
python -m pytest -q tests          # 7 tests, under a second
python experiments/minwall.py      # minwall.txt, minwall.json (about 1.5 minutes on 4 cores)
python experiments/diagnose.py     # diagnose.txt
```

## Results (from `experiments/minwall.txt`, `experiments/diagnose.txt`)
Lightest feasible mass (g), all peak stresses 99.8 to 100.0 MPa:

| Gauge b (mm) | Floor | min wall 1.2 | min wall 1.0 | min wall 0.8 |
|---|---|---|---|---|
| 0.8 | 3 or 1 | none | none | none |
| 1.0 | 3 | none | none | none |
| 1.0 | 1 | none | 24.81 (w 22.7, r 13.8, factor 1.33; 2/3 seeds) | 24.81 (same) |
| 1.5 | 3 | 31.06 | 31.06 | 31.06 |
| 1.5 | 1 | 31.00 | 31.00 | 31.00 |

- **The minimum wall was a blocker at 1.0 mm, but not the only one.** At 1.2 mm it rejects every 1.0 mm sheet by 17% (diagnose.txt). Once it is 1.0 mm or less, the only violation left at the widest allowed web (w = 25 mm) is the buckling floor of 3 (factor 1.48, shortfall 51%). So the floor decides.
- **With a floor of 1, a 1.0 mm design exists: 24.8 g**, 20% lighter than the best 1.5 mm design (31.0 g). Its buckling factor is 1.33. This is the only new feasible cell, and it needs both a relaxed wall and the weaker floor.
- **0.8 mm is infeasible under every setting tried**: at w = 25 mm the factor is 0.76, below even a floor of 1.
- **At 1.5 mm nothing changes**: the minimum wall is not active, the mass is the same in every column.

## Limitations
- The 24.8 g design rests on a factor of 1.33 from an ideal elastic flat-bar closed form. `simdesign-webshell` and `simdesign-buckle15` found the closed form's gaps in other geometries; real thin sheet buckles earlier (imperfections, plasticity, residual stress from cutting), and a factor of 1.33 is not a safety margin. It is a statement about the model, not a recommendation to build it.
- The minimum-wall values 1.0 and 0.8 mm are arbitrary relaxations, not justified by any laser-cutter datasheet. The 1.0 mm sheet is in the assumed stock list; its real availability and cost were not checked.
- Only 2 of 3 seeds found the 1.0 mm design (the feasible region is thin), so an optimiser with more budget might do better or find it every time. One load case, one material, mass is the only objective, one mesh (h = 1.5 mm; earlier projects show the mesh shifts feasible widths by about one scan step). The widest web is capped by the search bound w <= 25 mm.
- Simulated (calculated) results only; nothing was made or tested.

## Next steps
Check the 1.0 mm design (w = 22.7 mm) in the 3D eigenbuckling model of `simdesign-buckle15`; raise the w bound above 25 mm to see whether a floor of 3 becomes reachable at 1.0 mm; repeat at h = 1.0 mm.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest). Rule values, materials, load, the relaxed minimum walls and the buckling floors are assumptions that real shop data would replace.
