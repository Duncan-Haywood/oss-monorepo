# simdesign-buckleguard: what does it cost to replace the w/b ≤ 8 rule of the laser-cut bracket with a buckling-factor guard?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "replace the `MAX_SLENDER` guard in the bracket chain with a lower bound on the governing factor and rerun the optimiser" next step of `simdesign-webbuckle`, `simdesign-webshell` and `simdesign-shellorder`. Produced with AI assistance (Claude). A stylised 2D plane-stress model with a closed-form buckling check and assumed rule values, material and load; preliminary, nothing was made or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-buckleguard/

**Builds on.** `simdesign-dfm` (the process rules and the differential-evolution optimiser), `simdesign-widerweb` (the same code and bracket: L-shape, arms of 80 mm, tip load 100 N, steel sheet E = 200 GPa, ν = 0.30, working stress 100 MPa, tip limit 4 mm) and `simdesign-webbuckle` (the lateral-torsional buckling closed forms of Timoshenko and Gere, *Theory of Elastic Stability*, 2nd ed., McGraw-Hill, 1961; the page-level references are unchecked there too, only the two coefficients are verified numerically). `simdesign-shellorder` found a 3D finite-element critical load about 14% above the closed form for a short bar (l/w = 3), so the closed form was not unsafe in the one case checked. It builds on none of the CU Boulder groups in `prompt.md`.

## Method
The package is a copy of the `simdesign-widerweb` source with one change in `dfm.py`: the out-of-plane rule is selectable (`dfm.GUARD`):

- `"slender"` (the old rule): w/b ≤ 8;
- `"buckling"`: governing lateral-torsional safety factor ≥ K (default K = 3, an assumed knock-down for real sheet, not derived), evaluated with the process material's E and ν by `ltb.py`;
- `"none"`: no out-of-plane rule (reference).

Laser cutting only (steel sheet, stock gauges 1 to 12 mm, 1.2 mm minimum wall, so the 1 mm gauge is excluded by the minimum-wall rule before any buckling rule acts). The closed forms assume b < w; where they are meaningless (J < 0) the guard counts the design as violating. Minimum-mass design by differential evolution (popsize 6, maxiter 20, mesh h = 1.5 mm, peak von Mises) over all stock gauges, three seeds per guard (`experiments/guards.py`); then one seed per fixed gauge with K swept (`experiments/sensitivity.py`).

## Reproduce
```bash
pip install numpy scipy scikit-fem shapely matplotlib pytest
cd research/simdesign-buckleguard
python -m pytest -q tests            # 7 tests, about a second
python experiments/guards.py         # about 8 min on 4 cores; writes guards.txt/json
python experiments/sensitivity.py    # about 1 min on 4 cores; writes sensitivity.txt/json
```

## Results (from `experiments/guards.txt` and `sensitivity.txt`)
Lightest feasible design found, three seeds each:

| guard | gauge b | w (mm) | mass (g) | LTB factor |
|---|---|---|---|---|
| w/b ≤ 8 | 2.0 mm | 15.5–15.6 | 35.8–36.0 | 6.7 |
| buckling ≥ 3 | 1.5 mm | 18.5–18.8 | 31.1–31.4 | 3.5–3.6 |
| none | 1.5 mm | 18.3–18.8 | 31.0–31.4 | 3.4–3.6 |

- **The old rule cost about 12% of mass here.** It forces the 2 mm gauge (at b = 1.5 mm it allows only w ≤ 12 mm, where the peak stress is 227 to 266 MPa for fillets of 4, 8 and 12 mm against the 100 MPa limit); the buckling guard lets the 1.5 mm gauge be used at w ≈ 18.7 mm (w/b ≈ 12.5), 4 to 5 g lighter.
- **At K = 3 the guard does not bind.** The unguarded optimum already has a factor of 3.4 to 3.6 (seeds differ in the fillet radius, 7.7 to 14.5 mm, a flat region of the objective). The stress limit, not buckling, sets the width.
- **Sensitivity to K (one seed, `sensitivity.txt`).** At 1.5 mm gauge the optimum is 31.0 g for K = 1, 31.3 g for K = 3, and the search found no feasible design for K ≥ 5 within the bounds (w ≤ 25 mm) and budget. At 2 mm the mass is 35.9 g up to K = 5, 40.7 g at K = 8 and no feasible design at K = 12. At 3 mm the design is 44.2 g for every K tested (its factor is 17).
- The old rule and the buckling check point opposite ways at fixed gauge (`simdesign-webbuckle`): the rule caps w, but buckling safety grows with w. The guard replaces a ceiling with a floor.

## Limitations
- Closed-form buckling of ideal bars, ignoring initial imperfections, residual stress from cutting, corner flexibility and plasticity; K = 3 is a guess at a knock-down, and the whole result moves with it (see the sensitivity rows). The 3D check is one short bar (`simdesign-shellorder`), not these bracket arms.
- "Infeasible" at K ≥ 5 (1.5 mm) and K = 12 (2 mm) is what a stochastic search with a small budget found, not a proof.
- A load acting on the cut edge of a 1.5 mm sheet may also fail by local crippling or web buckling, which this model does not contain. One seed per K, one mesh, one load case, one material; the three-seed spread of mass is 0.4 g or less per guard.
- Simulated (calculated) only. The 1.5 mm design is not a recommendation to cut such a part.

## Next steps
Rerun with K derived from a shell eigenbuckling model of the L-bracket as one body; add a local-buckling check of the thin web; sweep load and arm lengths to see when the guard starts to bind.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material, load and the factor K are assumptions that real shop data would replace.
