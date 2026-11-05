# Research log: marine-sail

## 2026-11-05 · Milestone 5: polar and isochrone routing with a tack penalty (hypotheses written before the sweep)
- H1: planning with the tack cost cuts the cost-blind loss in steady wind by at least half. H2: a greedy layline controller is within 3% of the planner in steady wind. H3: it loses more than 5% in shifting wind.
- Outcome: H1 held (mean 4.5% to 1.0%). H2 held without tide (within quantisation) and failed with tide (up to 17.6%). H3 held (8.4% and 16.6% mean).
- Limits: parametric wind, unsourced craft and wave-drag coefficients, no published polar check.
