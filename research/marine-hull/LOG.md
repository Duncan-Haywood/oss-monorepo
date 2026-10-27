# Research log: marine-hull

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-27 · Milestone 1: does a catamaran out-range a monohull at survey speed? (planned before running)
- Why: H2. Plan (`experiments/run.py`): 200 kg craft, 25% battery, 30 W hotel load, 0.5 to 3 m/s; ITTC 1957 friction times form factor plus a placeholder wave term; 3^8 = 6,561 grid cases over hull constant, form factors, catamaran interference, both lengths, wave scale and battery specific energy (150 to 250 Wh/kg).
- **Prediction (before running):** the catamaran wins in under 5% of cases and in none at equal length (prior 75%). Refuted if it wins in 5% or more, or in any equal-length case.

### Outcome (`experiments/results.txt`)
- **Prediction held:** the catamaran wins 27 of 6,561 cases (0.4%), none of the 2,187 equal-length cases. Median range ratio cat/mono 0.85 (0.72 to 1.02). Wins need a shorter monohull (3 m) against 5 m demi-hulls or the reverse of the swept lengths with a low form factor, so they come from length, not the catamaran layout.
- Monohull best range 560 to 1,188 km (median 836 km) at a median 1.05 m/s: at 30 W hotel load the optimum is slow, which is the regime H1 describes. The range figures are an upper bound: no waves, current, turns or reserve, and the wave term is a placeholder.
- Not shown: anything about stability, deck area or payload mounting, which are why catamarans are chosen. Wave resistance, the main place a slender catamaran gains, is the unsourced part. The result says a friction-limited comparison at equal displacement does not favour the catamaran; it does not rank real boats.
- Citation checks: `cite_check.py` found two DOIs written from memory were wrong (Wynn et al. 2014 resolved to a seamount-observatory paper; the Rudnick 2004 DOI to a floats paper). Both were fixed or demoted in `PROPOSAL.md`.
- Next: milestone 2, a sourced wave-resistance curve and a published resistance curve to check against; Holtrop-Mennen for H3.
