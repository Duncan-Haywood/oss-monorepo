# Research log: marine-hull

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-27 · Milestone 2: does a Michell wave term change the catamaran verdict? (planned before running)
- Why: milestone 1's wave term was a placeholder, so H2 ("no equal-length case favours the catamaran") rested on an unsourced input. `src/marine_hull/michell.py` computes Michell thin-ship wave resistance for Wigley hulls (closed-form x and z integrals, Simpson over theta) and Havelock's two-hull interference. Plan (`experiments/run_michell.py`): the milestone-1 box with the placeholder replaced by Michell, real Wigley wetted area instead of the c_s constant, demi-hull spacing s/L swept 0.15, 0.25, 0.40, a Michell scale 0.5, 1, 1.5 (thin-ship theory is known to err in both directions), and the same battery, hotel load and propulsive efficiencies.
- **Predictions (before running):** (1) the catamaran still wins in under 5% of cases and in none of the equal-length cases at Michell scale 1 (prior 65%). (2) Wave resistance is under 10% of viscous resistance at the monohull's best-range speed in over 90% of cases (prior 70%). Refuted if the catamaran wins 5% or more, or in any equal-length case at scale 1.
- Checks done first: closed-form J against Simpson sums (agree to 1e-9 relative at 3 angles); dependence on theta steps (800 against 3,200: no change at 3 decimals). Not done: comparison with a published Wigley tank curve (no numeric table found in a web search; only plots).
- Limits known in advance: thin-ship theory, no viscous-wave coupling, Wigley shape only, form factor and interference still swept.

### Outcome of milestone 2 (`experiments/run_michell.py`, 1.5 s, deterministic; `experiments/results_michell.txt`; 6,561 cases)
- **(1) held:** the catamaran out-ranges the monohull in 216 of 6,561 cases (3.3%), none of the 729 equal-length cases at any Michell scale (0.5, 1, 1.5). Milestone 1 with the placeholder: 0.4%. Median range ratio cat/mono 0.87 (0.70 to 1.06). Wins need a 3 m monohull against 4 to 5 m demi-hulls or a low catamaran form factor.
- **(2) refuted:** wave resistance is under 10% of viscous at the monohull's best-range speed in 81.5% of cases, not over 90% (median 0.069, 90th percentile 0.106, max 0.121). The best-range speed is 1.0 m/s (max 1.1), Fr about 0.16 for a 4 m hull, so wave making is a small but not negligible term.
- Scale 0 to 1.5 on a 4 m monohull moves best range 847 to 815 km (-4%); the catamaran moves 721 to 710 km. The verdict does not move with the wave term, nor with demi-hull spacing (3.3% at each of s/L 0.15, 0.25, 0.4: Havelock interference shifts range by under 1% at these speeds).
- The placeholder understated wave resistance: Michell/viscous at 4 m, Fr 0.24 is 0.34 against the placeholder's 0.088. It does not matter for range because the optimum sits below Fr 0.2.
- Limits: Michell thin-ship theory with no published Wigley tank curve checked against (no numeric table found; plots only), so the absolute wave level is unvalidated, which the 0.5 to 1.5 scale only brackets. Wigley shapes only; form factor and viscous interference are still swept, not sourced.
- Next: milestone 3, Holtrop-Mennen against tank data for small hulls; digitise a Wigley Cw curve (Lazauskas 2009 thesis, Univ. of Adelaide) to validate `michell.py`.

## 2026-10-27 · Milestone 1: does a catamaran out-range a monohull at survey speed? (planned before running)
- Why: H2. Plan (`experiments/run.py`): 200 kg craft, 25% battery, 30 W hotel load, 0.5 to 3 m/s; ITTC 1957 friction times form factor plus a placeholder wave term; 3^8 = 6,561 grid cases over hull constant, form factors, catamaran interference, both lengths, wave scale and battery specific energy (150 to 250 Wh/kg).
- **Prediction (before running):** the catamaran wins in under 5% of cases and in none at equal length (prior 75%). Refuted if it wins in 5% or more, or in any equal-length case.

### Outcome (`experiments/results.txt`)
- **Prediction held:** the catamaran wins 27 of 6,561 cases (0.4%), none of the 2,187 equal-length cases. Median range ratio cat/mono 0.85 (0.72 to 1.02). Wins need a shorter monohull (3 m) against 5 m demi-hulls or the reverse of the swept lengths with a low form factor, so they come from length, not the catamaran layout.
- Monohull best range 560 to 1,188 km (median 836 km) at a median 1.05 m/s: at 30 W hotel load the optimum is slow, which is the regime H1 describes. The range figures are an upper bound: no waves, current, turns or reserve, and the wave term is a placeholder.
- Not shown: anything about stability, deck area or payload mounting, which are why catamarans are chosen. Wave resistance, the main place a slender catamaran gains, is the unsourced part. The result says a friction-limited comparison at equal displacement does not favour the catamaran; it does not rank real boats.
- Citation checks: `cite_check.py` found two DOIs written from memory were wrong (Wynn et al. 2014 resolved to a seamount-observatory paper; the Rudnick 2004 DOI to a floats paper). Both were fixed or demoted in `PROPOSAL.md`.
- Next: milestone 2, a sourced wave-resistance curve and a published resistance curve to check against; Holtrop-Mennen for H3.
