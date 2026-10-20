# simdesign-holes: how much does a bolt hole cost a tension plate, and which rule sets the width?

Follow-up to `simdesign-dfm` (track 5, `PROJECTS.md`), which listed multi-feature parts, where rules such as hole-to-edge distance bite, as its next step. A flat plate in tension has to carry one required hole of diameter `d`. It is sized for minimum mass under a working-stress limit, with three stress models of different fidelity and with per-process hole rules (FDM, CNC routing, laser cutting, sand casting). Produced with AI assistance (Claude). Everything here is a stylised model: rule values, material properties and the load are assumed round numbers, and nothing was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-holes/

**Builds on.** `research/simdesign-dfm` (the process list, material properties and rule style, restated here so the project stays self-contained); scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); the classical solution for a circular hole in a large plate under tension, which gives a stress concentration factor of 3 (Kirsch, 1898, *Zeitschrift des Vereines deutscher Ingenieure* 42:797–807; citation from memory, not re-verified). This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. It is a fidelity question in the repository's central theme: when is the cheaper stress model good enough to size the part?

## Method
- `src/simdesign_holes/fem.py`: plane-stress strip of width `W`, modelled length `4W`, thickness `t`, a hole of diameter `d` at the centre, uniform end traction `T/(W t)`. P2 triangles from a Delaunay mesh with rings of points graded away from the hole (`n_hole` points around it; 192 by default). Peak stress is the largest `sigma_xx` over quadrature points within `W` of the hole's cross-section, so the clamped end is excluded. `Kt_net` is that peak divided by the net-section stress `T/((W-d) t)`.
- `src/simdesign_holes/design.py`: three stress models give the width `W` that meets the working stress at thickness `t`:
  - **net section:** `Kt = 1` (ignores the concentration);
  - **Kt = 3:** the large-plate value on the net section (ignores finite width);
  - **FE:** `Kt_net` interpolated (PCHIP) from FE solves over `d/W` from 0.02 to 0.8 on a 30 mm strip.
- Process rules (all assumed): minimum hole (`CNC routing` 6.35 mm, one tool diameter; `casting` 6 mm; `FDM` 2 mm; laser: hole at least one sheet thickness); hole centre to edge at least `k·d` (FDM 1.0, CNC and laser 1.5, casting 2.0); ligament between hole and edge at least 3.175 mm (CNC), 1 mm (laser), 3 mm (casting), 1.2 mm otherwise; stock thicknesses and maximum depth as in `simdesign-dfm`; casting thickness at least 3 mm. Shared by every case, including "no process rules": thickness at least 1.2 mm, plate at most 60 mm wide, 100 mm long, load 1000 N.
- For each hole diameter the search is exhaustive over thickness (the stock list, or a 0.1 mm grid) with the width found by bisection, so there is no optimiser noise. Each chosen design is then re-solved by FE directly (`check_fe`); *utilisation* is FE peak stress over working stress, and above 1 the design fails.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib pytest
cd research/simdesign-holes
python -m pytest -q tests          # 9 tests, about 1 minute
python experiments/run.py          # writes experiments/results.txt, results.json, kt.png (about 3 minutes)
```

## Results (from `experiments/results.txt`)
**Stress concentration, FE.** For `d/W` of 0.05, 0.1, 0.2, 0.4, 0.6 and 0.8, `Kt_net` at `n_hole` = 384 is 2.840, 2.715, 2.505, 2.232, 2.108 and 2.032. It tends towards 3 as the hole shrinks, as Kirsch's limit says. A polynomial fit for a hole in a finite-width strip, which I recalled from the literature and did **not** check against its source, gives 2.852, 2.721, 2.506, 2.233, 2.106 and 2.053; the FE agrees with it to 0.5% for `d/W` up to 0.6 and is 1% below it at 0.8. The mesh is not fully converged: from 192 to 384 points around the hole, `Kt_net` rises by 0.6% to 1.4% (the largest at `d/W` = 0.8), and at 96 points the `d/W` = 0.4 value is an outlier (1.970), so the default of 192 is used throughout and its values are probably 1% low. Peak stress at the hole edge keeps rising with refinement, as in `simdesign-bracket`.

**Sizing (1000 N).** Utilisation is FE peak stress over working stress.
- **Dropping the concentration fails.** Sizing on the net-section stress alone gives designs that FE says are overstressed by 2.4 to 2.7 times for FDM, and 1.9 times at the smallest laser-cut hole (`d` = 4 mm); it passes only where an edge rule has already made the plate wide (laser from `d` = 8 mm, casting and CNC at every feasible hole size).
- **Kt = 3 is safe but heavy where stress binds.** It gives utilisation 0.79 to 0.93 for FDM and 0.78 to 0.85 for laser at small holes. Against the FE-sized plate, the mass is 8% to 26% higher for FDM (19.9 g against 18.4 g at `d` = 4 mm; 24.7 g against 19.5 g at 16 mm), 16% to 20% higher for laser holes up to 8 mm, and 8% higher for a 6 mm cast hole (20.7 g against 19.1 g).
- **Where an edge rule binds, the stress model does not matter.** Every model returns the same plate: CNC routing for all `d` from 8 mm (the first on the list above its 6.35 mm minimum), laser cutting for `d` ≥ 10 mm, casting for `d` ≥ 8 mm. There the plates are far stronger than needed (CNC utilisation 0.48 at `d` = 8 mm down to 0.24 at 16 mm; casting 0.89 down to 0.45) because the centre-to-edge rule sets the width.
- **Mass price of the hole rules** (FE model, same material, rules against only the shared guards): FDM 1.000 (no hole rule beyond the shared guards, so by construction); laser 1.03 at `d` = 6 mm rising to 1.80 at 16 mm; casting 1.19 at 6 mm rising to 2.27 at 12 mm (16 mm infeasible: the 4d edge rule needs more than the 60 mm width); CNC routing 2.17 at 8 mm rising to 3.59 at 16 mm. The CNC and casting prices also contain the effect of the thinnest allowed plate (3 mm, against 1.2 mm in the free case), so they are not hole-rule effects alone. The price of the stock and thickness limits is therefore mixed in with the price of the edge rule; I did not separate them.
- Holes below a process's minimum are infeasible by rule: CNC routing needs 6.35 mm (4 and 6 mm holes would be drilled instead, which this project does not model) and casting 6 mm (4 mm).

## Limitations
- Every rule value, material property and the load are assumed (typical order of magnitude), not sourced to a shop's capability sheet or a datasheet. The prices above scale with them, in particular with the edge-distance factors.
- 2D plane stress with the stress read as `sigma_xx` at quadrature points; no bolt contact, bearing or pin load, no tear-out check, no fatigue (where Kt matters most), no out-of-plane effects. A real bolted joint is not a free hole in a uniformly loaded strip.
- The FE table was computed for one strip (30 mm, steel Poisson ratio) and applied to all materials and widths. In this linear model Kt depends on `d/W` and, weakly, on Poisson's ratio (the difference between 0.30 and 0.36 is under 0.01%); the test allows 0.1%.
- Mesh not fully converged (see above), so FE-based utilisations of exactly 1.00 are not exact.
- One hole, centred. Offset holes, rows of holes, pocket features and hole-to-hole spacing rules are not modelled.
- Simulated result only; nothing was built.

## Next steps
Add offset holes and pitch rules; model a pin load; replace assumed rule values with a named shop's capability sheet; refine the mesh with an adaptive scheme and check the 1% drift; use the plate as the second part in `selfrep-nextmachine`'s scoring of which parts each added process can make.

## Owner steps
Cut or print the sized plates and test them in tension. Material, to be priced and dated before any purchase: a few grams of filament, a 3 mm aluminium plate offcut, 1.5 mm steel sheet. No prices are given here.

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, matplotlib, pytest). The rule values and materials are assumptions a real shop's data would replace; the machines (printer, router, laser, foundry) are not modelled beyond their rules.
