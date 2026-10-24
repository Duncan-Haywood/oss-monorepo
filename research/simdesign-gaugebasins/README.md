# simdesign-gaugebasins: are the two gauge-2 mass groups two basins in (w, r)?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), answering the first "next step" of `simdesign-gaugerestart`: that project found that feasible 2 mm results of the laser-cutting bracket search fall into two mass groups (below and above 34.65 g) but did not inspect the designs. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load; a small, preliminary experiment.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-gaugebasins/

**Builds on.** `research/simdesign-gaugerestart` (model, rules and optimiser copied into `src/simdesign_gaugebasins/` so the project stays self-contained; only the experiment scripts and tests differ), and through it `simdesign-gaugescatter`, `simdesign-gaugemesh` and `simdesign-dfm`. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); SciPy's `differential_evolution` (Storn and Price, 1997, *Journal of Global Optimization* 11:341–359). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser cutting rules (steel sheet, fillet floor 0.2 mm) and the no-rules steel-sheet twin, gauge 2 mm, peak von Mises stress on the 2.5 mm search mesh, design variables (w, r).
1. `experiments/basins.py`: rerun the `base` (population 4) and `bigpop` (population 8) searches for seeds 0–19, record the final (w, r) and mass, and split runs at 34.65 g as before. Also evaluate a 21 × 21 grid over the bounds (w 2–25 mm, r 0–15 mm; steps 1.15 and 0.75 mm) and count 4-neighbour connected components of the feasible set.
2. `experiments/wscan.py`: at fixed r (6, 8, 10, 12, 14 mm) scan w in 0.1 mm steps from 13.5 to 16.5 mm for feasibility (rules).

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-gaugebasins
python -m pytest -q tests          # 5 tests, about 10 seconds
python experiments/basins.py       # basins.txt, basins.json (about 5 minutes on 4 cores)
python experiments/wscan.py        # wscan.txt (about 1 minute)
```

## Results (from `experiments/basins.txt` and `experiments/wscan.txt`)
| variant | kind | lower group: n, w range (mm) | upper group: n, w range (mm) |
|---|---|---|---|
| base | rules | 10, 14.36–14.79 | 9, 15.30–15.63 |
| base | twin | 10, 14.33–14.79 | 10, 15.27–15.60 |
| bigpop | rules | 17, 14.32–14.86 | 3, 15.20–15.39 |
| bigpop | twin | 19, 14.32–14.52 | 1, 15.39 |

- **The groups separate in w, not in r.** Lower-group runs end at w ≈ 14.3–14.9 mm and upper-group runs at w ≈ 15.2–15.6 mm, with no overlap in any row. The final r is spread widely in both groups (base rules: 9.3–13.9 mm lower, 7.6–13.6 mm upper), so r is not what distinguishes them. Mass at fixed gauge follows w, which is why the mass groups are clean.
- **The coarse grid cannot show two basins.** Only 15 of 441 grid points are feasible, for rules and twin alike (minimum grid mass 33.75 g), and they form a single connected component. At that resolution the feasible set looks like one region, so the grid gives no support for two separate basins.
- **At 0.1 mm resolution the feasible set is ragged in w.** For r = 10, 12 and 14 mm the feasible w values are not contiguous (r = 10: 14.6, 14.7, then 15.5–16.0; r = 12: 14.8, then 15.5–16.0; r = 14: 14.4, 14.9, then 15.4–16.0). For r = 6 and 8 mm feasibility starts only at 15.7–15.9 mm. So at r ≥ 10 mm the feasible set has isolated pockets at lower w, below a contiguous region that starts near 15.4–15.5 mm.
- **Reading.** The upper group (w ≈ 15.2–15.6) sits at the start of the contiguous feasible region, and the lower group (w ≈ 14.3–14.9) matches the isolated pockets below it. This is consistent with the lower-mass group being narrow feasible pockets that a search finds only sometimes, with larger populations finding them more often (17–19 of 20 against 10 of 20), rather than two broad basins. The pockets look like an artefact of the stress evaluation on a 2.5 mm mesh (stress on a coarse mesh can change in steps as the geometry moves relative to the elements); we did not test that mechanism. It matches the `simdesign-gaugemesh` finding that gauge-2 feasibility disappears on finer meshes.

## Limitations
- Gauge 2 only, one process, one load, one mesh, the peak stress measure; 20 seeds per variant. The grid is coarse and the w scan covers five values of r.
- The scan and grid show where feasibility occurs, not that every pocket is a local optimum of the search; the link between pockets and the lower group is by matching w values, not by tracing runs into pockets.
- The mesh-artefact explanation is a hypothesis, untested here.
- Stylised 2D plane stress, assumed rule values and materials. Nothing was made or tested. Simulated results only.

## Next steps
Repeat the w scan on meshes of 2.5, 2.0 and 1.5 mm to see whether the pockets move or vanish; run the full ten-gauge `optimise` with a larger population and report the overall price scatter.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
