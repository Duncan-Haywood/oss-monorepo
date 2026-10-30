# Research log: marine-path

## 2026-10-30 · Milestone 1: LOS against integral LOS (hypotheses written before the sweep)
- H1: simulated plain-LOS offset equals delta*tan(asin(c/U)) within 1%. H2: ILOS has lower rms cross-track error than LOS in at least 90% of cases with current >= 0.2 m/s. H3: guidance changes energy per ground km by under 3% in the median.
- Outcome: H1 held (3.774 m, tested). H2 held, 136 of 144 (94%); the 8 misses are all delta = 6 m, kappa = 2 (integral oscillation, a finding I did not predict). H3: median 1.4%, but max 37% in the oscillating cases (median held, tail not).
- Limits: unsourced coefficients, sinusoid waves, start-up transient in the scores.
