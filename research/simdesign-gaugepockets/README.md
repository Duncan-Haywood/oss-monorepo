# simdesign-gaugepockets: do the isolated feasible pockets of the 2 mm laser-cut bracket survive mesh refinement?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the first "next step" of `simdesign-gaugebasins`: repeat its w scan on finer meshes. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load; a small, preliminary experiment.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-gaugepockets/

**Builds on.** `research/simdesign-gaugebasins` (model, rules and measures copied into `src/simdesign_gaugepockets/` so the project stays self-contained; only the experiment script and tests differ), and through it `simdesign-gaugemesh`, `simdesign-gaugescatter` and `simdesign-dfm`. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). No lab's work is built on here; the project belongs to the simulation-fidelity theme of the repository.

## Method
Laser cutting rules, steel sheet, gauge 2 mm, peak von Mises stress outside the clamp zone (the `peak` measure of `simdesign-gaugebasins`). For r = 6, 8, 10, 12 and 14 mm, w is scanned from 13.5 to 16.5 mm in 0.1 mm steps (31 values) and each design is tested for feasibility at element size h = 2.5, 2.0 and 1.5 mm (465 solves). "Pocket" means a maximal run of consecutive feasible w values below the top run (the one that reaches 16.0 mm).

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-gaugepockets
python -m pytest -q tests          # 5 tests, a few seconds
python experiments/pockets.py      # pockets.txt, pockets.json (about 15 seconds on 4 cores)
```

## Results (from `experiments/pockets.txt`)
Feasible w values (mm), by mesh and r:

| r (mm) | h = 2.5 | h = 2.0 | h = 1.5 |
|---|---|---|---|
| 6 | 15.9–16.0 | none | none |
| 8 | 15.7–16.0 | 15.6–15.7 | 15.8 |
| 10 | 14.6–14.7; 15.5–16.0 | 15.2–15.3; 15.6–15.8; 16.0 | 15.7–15.8; 16.0 |
| 12 | 14.8; 15.5–16.0 | 15.1–16.0 | 15.7–16.0 |
| 14 | 14.4; 14.9; 15.4–16.0 | 15.0–16.0 | 15.6–16.0 |

- **The pockets below w = 15 mm vanish.** At h = 2.5 mm, r = 10, 12 and 14 mm each show feasible w values between 14.4 and 14.9 mm. At h = 2.0 and 1.5 mm none of the 10 r/mesh combinations has a feasible w below 15.0 mm. This supports the `simdesign-gaugebasins` suggestion that the lighter mass group was a feature of the coarse mesh.
- **The feasible region shrinks and shifts to larger w with refinement, not monotonically.** Feasible counts over the five r values are 30 (2.5 mm), 29 (2.0 mm) and 13 (1.5 mm). The smallest feasible w for r = 14 mm is 14.4 (h = 2.5), 15.0 (h = 2.0) and 15.6 mm (h = 1.5); for r = 12 mm, 14.8, 15.1 and 15.7 mm. At r = 6 mm nothing is feasible on the two finer meshes.
- **Some raggedness remains on finer meshes.** At r = 10 mm, w = 15.9 mm is infeasible at h = 2.0 mm between feasible neighbours, and the h = 1.5 mm set is 15.7–15.8 and 16.0. Feasibility therefore still changes in steps as the geometry moves across elements, though the isolated low-w pockets are gone.
- Practical reading: the least-mass feasible w of the 2 mm gauge is mesh-dependent in this model (about 14.4 mm on the search mesh against about 15.6 mm at 1.5 mm for r = 14 mm); a search on the 2.5 mm mesh reports a lighter bracket than the finer meshes support. This agrees in direction with `simdesign-gaugemesh`.

## Limitations
- One gauge, one process, one load, the peak stress measure, five values of r, a 0.1 mm step in w, and three meshes. Mesh convergence was not reached; 1.5 mm is the finest mesh here, and the trend suggests the region may move further. Peak stress at a corner is itself mesh-sensitive (see `simdesign-patchstress` and `simdesign-gaugepatch`, which use a patch average).
- No search was run, so which designs a search would find is not tested; the link to the earlier mass groups is by matching w values.
- Stylised 2D plane stress, assumed rule values and materials. Nothing was made or tested. Simulated results only.

## Next steps
Repeat the scan with the 3 mm patch-averaged stress (`simdesign-gaugepatch`), which converged with the mesh, to see whether the feasible lower edge settles; add h = 1.0 mm.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
