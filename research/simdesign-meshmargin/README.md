# simdesign-meshmargin: does a mesh-aware stress margin change the mass price of manufacturability?

Follow-up to `simdesign-dfm` in the simulation-first design track (`PROJECTS.md`, track 5), taking up that project's first next step. `simdesign-dfm` sized an L-bracket under the rules of four processes using a coarse mesh (h = 2.5 mm) and found that its designs exceed the stress limit by 17–26% on a fine mesh. Here the search is repeated with a coarse mesh plus a stress knock-down, and with a finer mesh, and every design is re-checked at h = 0.7 mm. Produced with AI assistance (Claude). Everything is a stylised model: rule values and materials are the assumed round numbers of `simdesign-dfm`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-meshmargin/

**Builds on.** `research/simdesign-dfm` in this repository (model, rules and optimiser copied into `src/simdesign_meshmargin/` so the project stays self-contained), and through it `simdesign-bracket`; scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); SciPy's `differential_evolution` (Storn and Price, 1997, *Journal of Global Optimization* 11:341–359). This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Three search settings, each run for the four processes of `simdesign-dfm` and for the same material with no process rules, with seeds 0 and 1:
- **A**: search mesh h = 2.5 mm, stress limit as is (the `simdesign-dfm` setting).
- **B**: h = 2.5 mm, stress limit divided by a margin of 1.3 (chosen by hand, not tuned, as a knock-down for the 17–26% overshoot).
- **C**: h = 1.5 mm, stress limit as is.

Each chosen design is re-solved at h = 0.7 mm and its peak von Mises stress is divided by the original limit (check ratio; above 1.00 means the design fails on the check mesh). Price = best mass with rules / best mass without. Tip deflection is mesh-insensitive here (tests check it moves by under 2% from h = 2.5 to 1.0 mm), so only stress is checked.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-meshmargin
python -m pytest -q tests          # 4 tests
python experiments/run.py          # writes experiments/results.txt and results.json (about 20 minutes on 4 cores)
```

## Results (from `experiments/results.txt`; best of 2 seeds; check ratio = stress at h = 0.7 mm over the limit)
| setting | process | mass, rules (g) | mass, no rules (g) | price | check ratio, rules design | check ratio, free design |
|---|---|---|---|---|---|---|
| A | FDM | 16.28 | 16.28 | 1.000 | 1.17 | 1.17 |
| A | CNC routing | 14.09 | 11.37 | 1.239 | 1.26 | 1.22 |
| A | laser cutting | 35.37 | 33.55 | 1.054 | 1.11 | 1.23 |
| A | casting | 25.41 | 17.81 | 1.427 | 1.17 | 1.20 |
| B (margin 1.3) | FDM | 21.57 | 21.57 | 1.000 | 0.88 | 0.88 |
| B | CNC routing | 16.51 | 13.49 | 1.224 | 1.00 | 0.91 |
| B | laser cutting | 47.85 | 39.23 | 1.220 | 0.90 | 0.91 |
| B | casting | 30.00 | 21.47 | 1.397 | 1.02 | 0.88 |
| C (h = 1.5) | FDM | 17.14 | 17.14 | 1.000 | 1.09 | 1.09 |
| C | CNC routing | 15.21 | 12.27 | 1.239 | 1.11 | 1.06 |
| C | laser cutting | 35.79 | 35.45 | 1.009 | 1.08 | 1.08 |
| C | casting | 27.02 | 19.10 | 1.414 | 1.10 | 1.06 |

- **The ordering of the prices survives the mesh.** Casting is the most expensive rule set (1.40–1.43) and CNC routing next (1.22–1.24) in all three settings; FDM is 1.000 by construction. The CNC and casting prices move by at most 0.03 between settings.
- **The laser-cutting price does not survive.** It is 1.054, 1.220 and 1.009 in A, B and C. With two seeds, the laser searches are the noisiest in `simdesign-dfm` too (that project's three seeds spanned 33.3–41.0 g), so the 1.220 in B may partly reflect the optimiser: B's two laser seeds agree (47.85 and 47.92 g) but the free-design searches are separate runs. The honest reading is "about 1.0 to 1.2, not resolved at this seed count". (The 35.37 g in A differs from the 33.32 g of `simdesign-dfm` because its best seed, seed 2, is not run here.)
- **The knock-down of 1.3 is about right but not exact.** Under B the designs come out at 0.88–1.02 of the limit on the check mesh (CNC rules design 1.00, casting 1.02), so a 1.3 margin removes most of the overshoot at a mass cost of 17–35% over A (for example FDM 16.3 g to 21.6 g). Refining the search mesh to 1.5 mm (C) cuts the overshoot to 6–11% at a mass cost of 1–8%.
- **Stress at the check mesh is itself not converged.** In a spot check on one design the peak stress rose from 100 MPa (h = 2.5) through 111, 121 to 126 MPa at h = 0.7 mm, still increasing; a polygonal fillet (24 segments) and the sharp-corner stress singularities keep it rising with refinement. So "check ratio 1.00" means "meets the limit at h = 0.7 mm", not "safe".

## Limitations
- Two seeds per cell; differential evolution is noisy (see the laser rows), and I did not run enough seeds for confidence intervals. Differences under about 0.05 in price should be read as noise.
- The margin of 1.3 was set by hand from `simdesign-dfm`'s 17–26% overshoot, not calibrated; the check mesh is not a converged reference.
- All rule values, materials and the load are assumed numbers from `simdesign-dfm`, in a 2D plane-stress model. Nothing was made or tested. Simulated results only.

## Next steps
Use a stress measure that converges (stress averaged over a small patch, or a stress-concentration-factor correction for the fillet) in place of the peak element stress; more seeds on the laser case; apply the same check to `simdesign-holes`.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib). Rule values and material properties are assumptions that real shop data would replace.
