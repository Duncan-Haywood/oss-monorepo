# simdesign-loadrobust: how much stiffness does a topology-optimised cantilever lose when the real load points a different way than the model assumed?

A topology-optimisation design is only as good as the load case it was optimised for. This project asks the model-mismatch question the track's sim-fidelity theme leads to: if the simulated (digital-twin) load direction is wrong, how much stiffness is lost, and does optimising over a few load directions fix it cheaply? It is a new question for track 5, not another mesh or gauge variant, and it reuses `simdesign-topopt` unchanged. Stylised 2D, dimensionless, preliminary. Produced with AI assistance (Claude).

**Headline (one deterministic run per setting).** On a 48×24 cantilever at volume fraction 0.4, the design optimised for a straight-down tip load is within 5% of its own best when the load tilts up to 30°, but 1.57× at 60° and 2.58× when the load is horizontal (compared with a design optimised for that load alone). Optimising the mean compliance over loads at 0, ±60° cuts the worst case over −90° to 90° from 2.58× to 2.00× and costs 0.6% on the nominal load; ±90° gets 1.88× at a 2.9% nominal cost. Even the best multi-load design stays 1.7–1.9× off at 75–90°: one fixed topology cannot be stiff in every direction.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-loadrobust/

**Builds on.** `simdesign-topopt` (this repository): its Q4 plane-stress element, SIMP law, solver, sensitivity filter and cantilever problem are imported, not copied. Sigmund (2001), "A 99 line topology optimization code written in Matlab", *Struct. Multidisc. Optim.* 21(2):120–127, <https://doi.org/10.1007/s001580050176>. Multiple load cases in compliance minimisation are standard (a weighted sum of compliances, as in Bendsøe and Sigmund 2003, *Topology Optimization: Theory, Methods and Applications*, Springer); this project only measures how it behaves under load-direction error. It builds on no lab named in `prompt.md`.

## Method
- `src/simdesign_loadrobust/robust.py`: `angled_cantilever(θ)` is the cantilever with a unit tip load at mid-height, θ degrees from straight down (+90 points along +x, away from the wall). `multiload_simp` minimises Σ w_k c_k(x) with equal weights, the sensitivity filter (radius 2 elements) and the OC update (move limit 0.2) of `simdesign-topopt`. With one angle it reproduces `simdesign_topopt.simp` (tested).
- Designs: nominal (0°), and angle sets {0, ±15°}, {0, ±30°}, {0, ±45°}, {0, ±60°}, {0, ±90°}.
- Evaluation: every design is analysed under load directions every 15° from −90° to 90° (13 directions, most of them untrained). **Regret** = its compliance under that load ÷ the compliance of the design optimised for that load alone ("own optimum"; mirror loads reuse the mirrored design, valid because compliance is invariant to load sign).
- Units are dimensionless (E_0 = 1, unit load, unit element); compliance values compare within this README only.

## Reproduce
```bash
pip install numpy scipy matplotlib pytest
cd research/simdesign-loadrobust
python -m pytest -q tests          # 5 tests
python experiments/run.py          # writes experiments/results.txt and designs.png (about 15 s)
```

## Results (from `experiments/results.txt`)
Regret by load angle (selected rows; the full table has all 13):

| angle | own-opt compliance | nominal | {0,±30} | {0,±60} | {0,±90} |
|---|---|---|---|---|---|
| 0° | 91.9 | 1.00 | 1.00 | 1.01 | 1.03 |
| 30° | 69.9 | 1.05 | 1.04 | 1.04 | 1.06 |
| 45° | 45.6 | 1.20 | 1.17 | 1.16 | 1.16 |
| 60° | 23.3 | 1.57 | 1.51 | 1.41 | 1.39 |
| 75° | 9.2 | 2.49 | 2.33 | 2.00 | 1.88 |
| 90° | 7.0 | 2.58 | 2.35 | 1.88 | 1.68 |

| design | nominal regret | mean regret | worst regret |
|---|---|---|---|
| nominal (0) | 1.000 | 1.602 | 2.580 |
| {0,±15} | 1.000 | 1.578 | 2.502 |
| {0,±30} | 0.999 | 1.528 | 2.345 |
| {0,±45} | 1.000 | 1.453 | 2.155 |
| {0,±60} | 1.006 | 1.387 | 1.999 |
| {0,±90} | 1.029 | 1.343 | 1.877 |

- The nominal design is more forgiving than expected: a vertically loaded cantilever already carries axial load in its chords, so tilts to 30° cost at most 5%.
- Regret is mirror-symmetric in the angle, as it must be by the symmetry of the problem (a check on the code).
- Multi-load designs trade almost nothing on the nominal load for a lower worst case, but the gain is capped: the widest set still loses a factor 1.7 at 90° because the best horizontal-load design is a different, shorter-path layout.
- Regret ≈ 1.00 (0.999) in places is not an improvement: the "own optimum" is itself a local optimum of a non-convex problem, so a multi-load design can edge below it.

## Limitations
- 2D plane stress, one mesh (48×24), one volume fraction, one filter radius, one run per design: no seeds or restarts, so differences of about 1% are within what the local-optimum issue can produce.
- Equal weights on an arbitrary angle grid; mean regret depends on that grid. Worst-case (minimax) formulations and load-magnitude or load-position error are not tried.
- Compliance only, no stress or buckling limit; the grey (sensitivity-filtered) designs are evaluated as-is, not thresholded and re-analysed (see `simdesign-heaviside` for that gap).
- A model of load-direction error, not a measurement of any real structure. Simulated result only; nothing has been built.

## Next steps
A minimax (worst-case) formulation against the weighted sum at equal volume; load-position error (tip load moved along the free edge); repeat on the half-MBB and with the density filter and projection of `simdesign-heaviside`.

## Owner steps
None.

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, matplotlib). No hardware.
