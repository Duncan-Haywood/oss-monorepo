# Research log: aerolog-scaling

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

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
