# simdesign-volscale: how much stiffer than a uniformly thinned plate is a topology-optimised part, and how does that depend on volume fraction?

Free of the micro-variant chain in track 5 (`PROJECTS.md`, simulation-first design): earlier `simdesign-*` projects tune one bracket; this one asks a design rule of thumb instead, "what does the next 10% of material buy?". Produced with AI assistance (Claude). A stylised, preliminary study of two 2D plane-stress problems on coarse grids; nothing was made or tested. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-volscale/

**Headline (two problems, one run each).** Once the 0/1 design is connected (volume fraction 0.3 and up for the cantilever, 0.15 and up for the half-MBB), its compliance is 26 to 31% below that of a plate thinned uniformly to the same volume at v = 0.3 to 0.5, and the advantage shrinks to about 14% at v = 0.8. Below that, on these grids, the design is no longer one connected body and its compliance is orders of magnitude worse.

**Builds on.** `simdesign-topopt` (SIMP solver copied unchanged: Q4 plane-stress elements, p = 3, E_min = 1e-9, sensitivity filter, OC update; after O. Sigmund, "A 99 line topology optimization code written in Matlab", *Structural and Multidisciplinary Optimization* 21(2):120–127, 2001). The thin-plate reference is the textbook scaling that stiffness is proportional to thickness, so a plate thinned to volume fraction v has compliance C_solid / v. Michell (1904), "The limits of economy of material in frame-structures", *Philosophical Magazine* 8(47):589–597, is the classical low-volume limit that motivates looking at how compliance scales with volume.

## Method
For each problem (cantilever 60×20, rmin 1.5; half-MBB 90×30, rmin 2.0) and each volume fraction v in {0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80}: run SIMP (p = 3, at most 300 iterations, stop when no density changes by more than 0.01); record the compliance of the grey field; threshold it to 0/1 at the volume quantile and re-analyse it (compliance of a real black-and-white part); compare with C_solid / v where C_solid is the compliance of the fully solid grid. Then fit C = A·v^−k in log-log space over v in [0.3, 0.8]. Units are dimensionless (E_0 = 1, unit load, unit element), so only ratios are meaningful.

## Reproduce
```bash
pip install numpy scipy matplotlib pytest
cd research/simdesign-volscale
python -m pytest -q tests          # 4 tests, under a second
python experiments/run.py          # about 1.5 min; writes experiments/results.txt and scaling.png
```

## Results (from `experiments/results.txt`)
Ratio C_binary · v / C_solid (below 1 means the topology beats the thinned plate; the thinned plate is exactly 1):

| v | cantilever 60×20 | half-MBB 90×30 |
|---|---|---|
| 0.10 | 225535 (disconnected) | 390 (disconnected) |
| 0.15 | 22664 (disconnected) | 0.738 |
| 0.20 | 44.3 (disconnected) | 0.687 |
| 0.30 | 0.739 | 0.692 |
| 0.40 | 0.713 | 0.718 |
| 0.50 | 0.736 | 0.739 |
| 0.60 | 0.764 | 0.764 |
| 0.70 | 0.809 | 0.806 |
| 0.80 | 0.860 | 0.858 |

- The ratio is U-shaped in v: best (about 0.69 to 0.71) at v ≈ 0.2 to 0.4 and creeping back toward 1 as v → 1, where there is no material left to remove.
- Power-law fits over v in [0.3, 0.8]: binary C ∝ v^−0.84 (cantilever) and v^−0.79 (MBB), against exactly v^−1 for the thinned plate. The grey SIMP field fits v^−1.13 and v^−0.91. These are fits to a curved relationship over a narrow range; read them as "close to inverse proportion", not as a law.
- The grey SIMP compliance is not the compliance of a part. It exceeds the thinned-plate value at v = 0.3 for the cantilever and below because intermediate densities are penalised (p = 3).
- Runs marked 300 in the iteration column of `results.txt` hit the cap rather than the tolerance (all v ≤ 0.2, and the MBB at v = 0.7 and 0.8 nearly so); their numbers are not converged optima.

## Limitations
- The comparison plate is a variable-thickness design. At fixed thickness you cannot thin a plate, so this is the benchmark a designer who can choose thickness faces, not a fixed-thickness competitor.
- Thresholding at the volume quantile is one rule; the lowest-volume cantilever fields are disconnected under it, and a connectivity-preserving projection or a finer grid would likely change the v ≤ 0.2 rows. The disconnection is a grid and filter-radius effect (members thinner than about one filter radius cannot form), not a statement about the physics.
- Two loads, two aspect ratios, one grid each, one run each, no mesh refinement. No checks against a 3D model or a physical part.

## Next steps
Repeat on 2× finer grids with a fixed physical filter radius to see whether the disconnected rows reconnect; add a connectivity-preserving projection; test a third load case (a point load on a square domain) to see whether the 0.69 to 0.74 plateau holds.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, matplotlib; pytest). Material, loads and boundary conditions are assumptions.
