# civ-levers research log

## 2026-10-26 · Plan: contact that widens tolerance (milestone 2, written before the run)

- Model: `src/civ_levers/contact.py`. Each agent has its own eps_i; an accepted cross-camp meeting raises eps_i by `gain` (cap 0.5), a repelled one lowers it by `loss`. Stand-in for Pettigrew and Tropp (2006); the gain and loss rates are not measured and are swept.
- H1: with gain > 0, bridging at dose 0.25 merges the camps in settings where fixed-eps bridging merged none (eps 0.2 to 0.3, no backfire). Refuted if merged stays 0 of 10 at every gain up to 0.05.
- H2: under backfire (tau 0.7) widening does not rescue bridging, since repelled meetings shrink eps (loss > 0) and repulsion pushes the camps apart faster than tolerance grows. Refuted if bridging with gain 0.02 merges at tau 0.7 with loss 0.02.
- H3 (identity): if committed moderates are dismissed with probability q as the other camp's, a 20% moderate share stops merging by q = 0.5. Refuted if the merged count at q = 0.5 stays within one seed of q = 0.
- Analysis: 10 societies per cell, same society as civ-levers (n 1000, 400 sweeps); merged = gap < 0.1; Wilson intervals on merged counts.
- Outcome of the first run (accepted-contact rule): gain had **no effect in any of 135 bridging cells** (merged 0 of 10 everywhere, mean eps unchanged to two decimals). Reason: camps start 0.6 apart, so a cross-camp meeting is never within eps 0.2 to 0.3 and tolerance never gets a chance to grow; contact that only counts when already accepted is circular. H1 refuted for this rule. Under backfire eps collapses (floor reached) and extremes reach 0.6 to 1.0 as in civ-levers. Identity (H3): refuted for eps 0.3 (10 of 10 merge at every q to 0.75, the committed voices are heard a quarter of the time and that suffices); at eps 0.2 the 0.5 voice is out of reach anyway (0 of 10 at all q).
- Follow-up logged before running: **exposure rule** (widen on any cross-camp meeting not repelled). H1b: this merges at least some no-backfire settings at gain >= 0.02. H2b: under tau 0.7 still no merge.

## 2026-10-24 · First sweep: bridging backfires, a ladder within reach works

- Built the two-camp model (bounded confidence plus repulsion) and checked it against Deffuant et al. (2000) cluster counts, the Hegselmann–Krause consensus threshold, the DeGroot and single-zealot fixed points and Jager–Amblard bipolarization.
- Swept six levers over dose, ε 0.2–0.4 and τ none–0.6: bridging merges 2 of 25 settings and pushes more people to the extremes in 10; a ladder of committed voices merges 24.
- A ladder spaced for a higher tolerance than the real one fails (0 of 10 at true ε 0.2, designed for 0.3); spacing for the least tolerant costs nothing.
- Shipped the browser simulator (`app/`), checked against the Python model.
- Next: contact that also widens tolerance; identity (a moderate seen as the other side's); two-dimensional opinions; calibrating ε and τ to panel data on attitude change.
