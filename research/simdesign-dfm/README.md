# simdesign-dfm: what do manufacturing rules cost a sized bracket on four processes?

Fifth milestone of the simulation-first design track (`PROJECTS.md`, track 5). The parametric L-bracket of `simdesign-bracket` is sized for minimum mass under a stress and a deflection limit, once with no process rules and once under the rules of FDM printing, CNC routing, laser cutting and sand casting. The ratio of the two masses is the *mass price of manufacturability*. Produced with AI assistance (Claude). Everything here is a stylised model: rule values and material properties are assumed round numbers, not datasheet values.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-dfm/

**Builds on.** `research/simdesign-bracket` in this repository (the L-profile, 2D plane-stress model and the STL writer, copied into `src/simdesign_dfm/` so that the project stays self-contained); scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); SciPy's `differential_evolution` (Storn and Price, 1997, *Journal of Global Optimization* 11:341–359); Shapely for polygon offsets (<https://github.com/shapely/shapely>). The idea that process rules can be written as constraints on a parametric design is standard design-for-manufacture practice (see Boothroyd, Dewhurst and Knight, *Product Design for Manufacture and Assembly*, 3rd ed., CRC Press, 2011, as background); none of the numbers below is taken from it. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. It is the by-product track 1's shop needs: a check of which of its processes (FDM, CNC routing, laser cutting, casting) can make a given part, and at what mass.

## Method
- `src/simdesign_dfm/dfm.py`: a `Process` is a material plus rules on the design variables arm width `w`, inner fillet `r` and depth `b` (mm). A rule returns a relative violation (0 = satisfied).
  - **Shared by every case, including "no process rules":** minimum wall 1.2 mm; `w/b` at most 8 (a crude guard for out-of-plane buckling, which a 2D model cannot see); tip deflection at most 4 mm; peak von Mises stress at most the material's working stress.
  - **FDM** (unfilled thermoplastic): printed flat on the bed, so no overhangs. It adds nothing to the shared rules, so its price is 1.000 by construction.
  - **CNC routing** (aluminium plate): 6.35 mm end mill, so inner radius at least 3.175 mm, webs at least one tool diameter, depth at most three diameters (19.05 mm), and depth taken from a list of metric plate thicknesses (3 to 25 mm).
  - **Laser cutting** (mild steel sheet): inner radius at least 0.2 mm, web at least one sheet thickness, depth from sheet gauges 1 to 12 mm.
  - **Sand casting** (cast aluminium, parting plane at mid-depth): inner radius at least 3 mm, walls at least 3 mm, 1.5 degrees of draft, and a hot-spot rule `max(w, b) / min(w, b) ≤ 3`. The drafted part is analysed at its narrowest section (the faces: `w` shrinks by `b·tan(draft)`, `r` grows by half of that; arm lengths unchanged) and its mass comes from Simpson's rule over the tapered volume.
- Search: `optimise.py` runs SciPy differential evolution on `(w, r, b)` with a penalty plus a fixed barrier on infeasible designs. For processes with stock thicknesses it runs one search per thickness and keeps the lightest feasible design. Three seeds per case; the table reports the best and lists all three.
- Each process is compared with *the same material and no process rules*, so the ratio isolates the rules and not the material.
- Manufacturing files for the chosen designs: `bracket_fdm.stl` (FDM) and `profile_*.dxf` (profile for the router, laser and the casting pattern's parting plane). The DXF files are tested only by writing and re-reading them here; they have not been opened in a CAM or CAD package.
- The finite-element model, load (100 N at the tip) and clamp are those of `simdesign-bracket`.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-dfm
python -m pytest -q tests          # 12 tests
python experiments/run.py          # writes experiments/results.txt, results.json, profiles.png, STL and DXF (about 15 minutes on 4 cores)
```

## Results (from `experiments/results.txt`; mesh h = 2.5 mm in the search, units mm, g, MPa)
| process (material) | w | r | b | mass, rules (g) | mass, no process rules (g) | price | seeds, rules (g) |
|---|---|---|---|---|---|---|---|
| FDM (plastic) | 24.5 | 14.0 | 3.9 | 16.28 | 16.28 | 1.000 | 17.41, 16.28, 16.51 |
| CNC routing (aluminium plate) | 11.6 | 8.7 | 3.0 | 14.09 | 11.37 | 1.239 | 14.09, 14.19, 14.20 |
| laser cutting (steel sheet) | 14.4 | 10.7 | 2.0 | 33.32 | 33.55 | 0.993 | 41.01, 35.37, 33.32 |
| casting (cast aluminium) | 13.9 | 10.8 | 4.65 | 25.41 | 17.81 | 1.427 | 26.06, 25.41, 25.69 |

- **Casting pays most (+43%), and the even-section rule causes it, not the draft.** Relaxing the wall-ratio limit from 3 to 5 gives 21.5 g, to 2 gives 28.3 g, and with the rule off 18.0 g. Draft from 0 to 10 degrees moves the mass between 25.2 and 27.0 g, which is within the search noise (best of one seed per point; the three seeds at 1.5 degrees span 25.4–26.1 g) except possibly at 10 degrees. The hot-spot rule forces a deeper, narrower part (b 4.65 mm instead of 2.4 mm).
- **CNC routing pays +24%, and the plate-thickness list causes it.** The unconstrained aluminium optimum wants a 2.0 mm depth; the thinnest plate on the list is 3 mm, and the web rule (6.35 mm) is not binding. The tool radius has no visible effect: for tool radii 0.5 to 9 mm the best mass stays between 14.1 and 14.2 g, because the optimum already wants a fillet of 5 mm or more.
- **Laser cutting pays nothing (0.993 is noise).** A 2 mm gauge is on the list and wins. The three seeds spread from 33.3 to 41.0 g, so the optimiser is the larger uncertainty here, not the rules.
- **FDM:** the 1.000 is by construction (no rule beyond the shared ones); the three seeds spread 16.3–17.4 g.
- Across processes the absolute masses are not comparable: materials differ (steel is 3 times as dense as aluminium) and so do the assumed working stresses. Only each row's ratio to its own free optimum is meaningful.
- **The designs are not safe on a fine mesh.** Re-solving each chosen design at h = 0.7 mm gives a peak stress 17% to 26% above the working stress, with and without process rules (stress at the fillet keeps rising with refinement, as `simdesign-bracket` found). The ratios compare designs on the same coarse mesh, so they are consistent with each other, but no row's absolute design meets its stress limit in a converged model.
- The unconstrained designs in this table sit on the `w/b ≤ 8` guard for the metals (for example 2.0 mm depth with 14.5 mm width for aluminium plate), so how large the CNC and casting prices look depends on that assumed guard.
- Mean FE evaluations per optimisation: FDM 788, CNC 906, laser 999, casting 601.
- Plastic FDM mass here (16.3 g) is lower than `simdesign-bracket`'s 19.6 g for a similar problem: this project uses a coarser mesh in the search (h 2.5 vs 1.5 mm, which under-reads stress) and a wider depth range.

## Limitations
- **Every rule value and material property is assumed** (typical order of magnitude), not sourced to a datasheet, a standard or a shop's capability sheet: tool size, stock lists, minimum walls, 1.5 degrees of draft, the wall-ratio limit of 3, the 8:1 slenderness guard, the working stresses. Prices of manufacturability scale with them.
- 2D plane stress; no out-of-plane buckling, fatigue, bolts, bending of a laser-cut flat plate into a real bracket, porosity or shrinkage in casting, or anisotropy of printed parts. The casting draft is handled through the narrowest section only.
- Stress is mesh-sensitive (see above); optimisation used a coarse mesh and the results exceed the limit when rechecked.
- Differential evolution with three seeds is noisy (over 20% spread in the laser case). The sweeps use one seed per point and several of their differences are within that noise.
- Nothing here was checked against a real print, cut or casting. Simulated result only.

## Next steps
Run the search on a mesh-converged stress, or add a margin; replace assumed rule values with those of a named shop's capability sheet; add multi-feature parts (holes, pockets) where rules like hole-to-edge distance bite; feed the process choice into `selfrep-nextmachine` (which machine to add next) by scoring which parts each added process can make.

## Owner steps
Make the part by each process available to the owner and test it. Bill of materials, each price to be sourced and dated before any purchase: printer filament (about 20 g), a 3 mm aluminium plate offcut (about 14 g) for a router or a laser, 2 mm steel sheet (about 33 g), casting patterns and a foundry run. No prices are given here.

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib). The material properties and rule values are assumptions that a real shop's data would replace; the CNC, laser and casting steps need machines this project does not model beyond their rules.
