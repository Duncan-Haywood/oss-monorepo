# simdesign-webbuckle: does lateral-torsional buckling justify the w/b ≤ 8 slenderness rule of the 2 mm laser-cut bracket?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "replace the arbitrary slenderness limit with a buckling check" next step of `simdesign-widerweb`. Produced with AI assistance (Claude). A stylised closed-form check with assumed loads and material; preliminary, and not validated against a shell or 3D finite-element model.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-webbuckle/

**Builds on.** `simdesign-widerweb` and, through it, `simdesign-meshconverge` and `simdesign-dfm` (same bracket: L-shape, arms of length 80 mm, width w, sheet thickness b, 100 N tip load, steel with E = 200 GPa and ν = 0.30). Buckling formulas for a slender elastic cantilever bar are classical: S. P. Timoshenko and J. M. Gere, *Theory of Elastic Stability*, 2nd ed., McGraw-Hill, 1961 (lateral buckling of beams; the torsion constant of a thin rectangle is in Timoshenko and Goodier, *Theory of Elasticity*, 3rd ed., McGraw-Hill, 1970). I wrote these formulas from memory of those texts and did not have the books to hand, so the page-level references are unchecked; the two coefficients are instead checked numerically in the tests (below). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
In the 2D plane-stress model the part is loaded in its own plane, so each arm is a flat bar bent about its strong axis. The mode the 2D model cannot see is lateral-torsional buckling (sideways deflection plus twist). With I<sub>y</sub> = w b³/12, J = (w b³/3)(1 − 0.63 b/w) and G = E/(2(1+ν)):

- vertical arm (clamped at the top, length H = 80 mm) under the end moment M = F(L − w/2): M<sub>cr</sub> = π/(2H) · √(E I<sub>y</sub> G J);
- horizontal arm (cantilever of length L − w from the corner) under the tip load F at the centroid: P<sub>cr</sub> = 4.013 √(E I<sub>y</sub> G J)/(L − w)².

The safety factor is the critical over the applied load; the governing factor is the smaller of the two. The tension that F puts in the vertical arm (stabilising) and the restraint of the corner are ignored; the first is conservative, the second is not obviously either way. `tests/test_ltb.py` solves the twist equation GJ φ'' + q(x)² φ / (E I<sub>y</sub>) = 0 by finite differences for both load cases and recovers π/2 (1.5708) and 4.013, which checks the two coefficients against the stated model but not the model against a real sheet.

## Reproduce
```bash
pip install numpy scipy pytest
cd research/simdesign-webbuckle
python -m pytest -q tests        # 4 tests, a few seconds
python experiments/scan.py       # writes experiments/scan.txt
```

## Results (from `experiments/scan.txt`)
Governing safety factor (critical over applied load, F = 100 N):

| w (mm) | b = 1 mm | b = 2 mm | b = 3 mm |
|---|---|---|---|
| 8 | 0.41 | 3.14 | 10.08 |
| 12 | 0.64 | 4.98 | 16.31 |
| 16 | 0.88 | 6.93 | 22.87 |
| 20 | 1.14 | 8.98 | 29.80 |
| 25 | 1.48 | 11.72 | 39.03 |

The vertical arm governs in every case computed. Smallest w (0.1 mm grid) with governing factor ≥ 1, 2, 3, 5: at b = 2 mm, 3.2, 5.5, 7.7 and 12.1 mm; at b = 3 mm, 3.0 (grid edge), 3.0, 3.3 and 4.7 mm; at b = 1 mm, 17.9 mm for factor 1 and none up to 25 mm for factor 2.

- **At the 2 mm gauge buckling does not limit the widths of `simdesign-widerweb`.** At w = 16 to 20 mm the factor is 6.9 to 9.0, so under this model the widths scanned there are not buckling-limited, and the relaxation of the rule to 12.5 did not admit unsafe designs.
- **The direction of the rule is the opposite of this mode's.** Lateral-torsional buckling gets safer as w grows at fixed b (the bar becomes stiffer in torsion faster than the moment grows), so a ceiling on w/b protects nothing here. It is a floor on w that matters, and the floor depends on the gauge.
- **At b = 1 mm the old rule would admit buckling designs.** w/b ≤ 8 allows w up to 8 mm, where the factor is 0.41 (below 1). Under this model a 1 mm sheet needs w ≈ 18 mm just to reach a factor of 1.

## Limitations
- Ideal, prismatic, elastic bars; no initial twist or sweep, no residual stress from laser cutting, no corner flexibility, no plasticity. Real critical loads of sheet metal are lower than classical ones, and the factors above should not be read as margins.
- The load is assumed to act at the centroid of the tip section and the clamp is assumed rigid; a load applied above or below the neutral axis (in z) changes the horizontal-arm result.
- Not checked against a shell or 3D eigenbuckling model, so the model-form error of the closed forms for these proportions (w/L up to 0.31) is unknown. The coefficients are checked only for the stated ideal problem.
- Only the buckling side was assessed; stress and deflection feasibility are taken from `simdesign-widerweb`, not recomputed. One load case, one material, three gauges. Simulated (calculated) only: nothing was made or tested.

## Next steps
Check the closed forms against a 3D or shell eigenbuckling model in scikit-fem for w = 8, 16 and 25 mm at b = 2 mm; replace the `MAX_SLENDER` guard in the bracket chain with a lower bound on the governing factor; rerun the optimiser at b = 1 mm with that bound.

## Owner steps
None needed (calculation only).

## Outside dependencies (vitamins)
numpy and scipy (and pytest for tests). The textbook formulas, the material properties and the load are assumptions or sources that a shell model and sheet-metal test data would replace.
