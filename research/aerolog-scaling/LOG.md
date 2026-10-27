# Research log: aerolog-scaling

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.


## 2026-10-27 · Milestone 3a: do trim speed and the longitudinal modes survive Reynolds-dependent aerodynamics? (predictions written after a first exploratory run, so not blind)
- Why: H1 says trim speed and mode frequencies agree within 3% (refuted over 5%) at n = 0.1. Froude scaling makes them agree exactly for fixed coefficients, so any gap comes from Re-dependent CL(alpha), CD and tail effectiveness.
- Plan (`experiments/longitudinal_modes/run.py`): wing NACA 4412 plus tail NACA 0012, NeuralFoil polars at each surface's Re, 4-state Etkin model; model flown at full-size trim angle, or at full-size CL. Predictions (stated after seeing a first run that crashed on the mode extraction, before the final numbers): trim speed moves under 3% at n = 0.1 (tripped); frequencies within 3%; short-period damping moves more than frequency.

### Outcome (`experiments/longitudinal_modes/results.txt`)
- Tripped, n = 0.1 vs 1: same-alpha rule gives dV +6.5%, phugoid frequency -5.2%, short-period frequency +5.1%, damping -6.7%: **H1 refuted on this rule** (prediction 1 and 2 wrong). Same-CL rule: frequencies +0.8% and -1.3% (held), short-period damping -6.3% (prediction 3 held).
- Free transition at n = 0.1 and 0.05: the short period becomes overdamped (two real roots) and trim CL drops; this is the NeuralFoil bubble regime from 4a, not used as a result.
- Phugoid damping is positive in the textbook estimate but negative here even at n = 1 (induced-drag slope CD_alpha with no speed-dependent thrust); the sign is a modelling artefact, so it is not reported.
- Limits: no gust response (H1 names it); the surrogate is unvalidated against UIUC data; geometry and CG are design choices; the tail is trimmed by the elevator at zero lift; no thrust-line or propeller terms.
- Next: gust response; thrust law; UIUC polar check.

## 2026-10-27 · Milestone 4a: do airfoil polars keep H2 (power) and H3 (CLmax)? (predictions fixed before the run)
- Why: milestone 1's flat-plate drag could not say whether H2 survives a real section. XFOIL itself is not installable here; NeuralFoil 0.3.3 (a neural surrogate trained on XFOIL, MIT) is, via AeroSandbox 4.2.10.
- Plan (`experiments/airfoil_polars/run.py`): NACA 4412 section, Re_mac from the milestone-1 calculator at n = 1 to 0.05, three boundary-layer states (n_crit 9, n_crit 5, trip at 5% chord). Section cd at cl = 0.8 plus induced drag (AR 10, e 0.8) gives the power ratio against n = 1; CLmax from the alpha sweep.
- **Predictions:** (1) the n = 0.1 power ratio is at least 1.20 in all three states (H2 refuted if under 1.10). (2) CLmax falls by at least 0.2 at n = 0.1 in all three states (H3 refuted if under 0.1). (3) the surrogate is not trustworthy at n = 0.05 (Re 3.4e4).

### Outcome (`experiments/airfoil_polars/results.txt`)
- Power ratio vs Froude at n = 0.1 (Re_mac 9.7e4): 1.445 (n_crit 9), 1.291 (n_crit 5), 1.361 (tripped). **(1) held**; milestone 1's flat-plate 1.27 sits at the bottom of this range. At n = 0.2 the ratio is 1.11 to 1.19, so the 20% bar is not met there.
- CLmax change at n = 0.1: -0.37, -0.52, -0.48. **(2) held** (H3 supported for a 2D clean section).
- **(3) held:** free-transition n_crit 9 at n = 0.05 gives cd 0.137 (ratio 5.3), a separated-bubble regime the other two states do not show (1.8 to 2.0); not used as a result.
- Not done: no check against UIUC measured polars (hosts 403 or not tried), so the surrogate error is unquantified; NeuralFoil CLmax at Re 3e6 is 1.84, which looks high against the 4412's textbook value (from memory, unchecked). 2D section only: no finite-wing, flap or Reynolds-dependent induced effects; cl = CL strip approximation.
- Next: UIUC polar check of the surrogate; vortex-lattice model for H1.

## 2026-10-27 · Milestone 1: how much power does a Froude model need beyond the Froude prediction? (planned before running)
- Hypothesis: with a flat-plate skin-friction drag model, a Froude-scaled model at n = 0.1 needs more than 20% extra power over `n^3.5 x P_full` (H2), because Re falls as `n^1.5` and Cf rises as Re falls, while all other Froude-scaled quantities match by construction.
- Plan: `experiments/run.py` scales one 1,000 kg, AR 10 airframe to n = 1 to 0.05 and reports Re, CD0, L/D, the power ratio and the battery fraction for a range scaled with length; sweeps form factor, wetted area and aspect ratio; compares a tripped (turbulent) with an untripped (laminar below Re 5e5) boundary layer. Unit tests check the ISA, Sutherland viscosity, the exponent table's dimensional consistency and the skin-friction formulas.

### Outcome
- Tripped base case: power ratio 1.06 (n = 0.5), 1.16 (0.2), 1.27 (0.1), 1.42 (0.05); L/D falls from 22.8 to 18.0 at n = 0.1. Across the CD0 and aspect-ratio sweeps the n = 0.1 ratio is 1.17 to 1.35, so the >20% bar holds in every case except aspect ratio 6 (1.17); the low-drag case is 1.21.
- The untripped case is not monotone: attached laminar flow gives lower Cf at Re near 3e5, so the model *beats* full scale (ratio 0.96 at n = 0.2) until Re falls to 1e5. This is an artefact of the model, since real wings at that Re separate. It is why H2 must be tested with XFOIL polars, not a flat plate.
- Battery fraction for a range scaled with length falls with n (0.13x at n = 0.1) so a model at fixed cell specific energy has far more battery margin than the full-size aircraft per body length: endurance in scaled time does not test the full-size energy budget. This follows from range, not from drag.
- So H2 is supported at the base case by a flat-plate estimate, not yet by an airfoil-based one. Preliminary; first-order model only.
- Limits: flat-plate Cf with a form factor, not an airfoil; no induced-drag Re effect; no CLmax; powertrain efficiency held fixed (it falls with scale, so the ratio here is optimistic); constants for the airframe are design choices, swept but not sourced to a specific aircraft; citations not machine-checked.
- Next: milestone 2 and 3 (open the NASA table; vortex-lattice and flight-dynamics model).
