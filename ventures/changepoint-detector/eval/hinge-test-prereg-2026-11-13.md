# Pre-registration: a level hinge test on real temperature records (2026-11-13)

Written before `hinge-test.mjs` was run on any real series. Context: README, "Global temperature: a
documented 1945 step": the slope-break test on differences finds the recalled 1976 acceleration as its
best split but W is 1.8 against a bar of 8.4 (p 0.80), and the bend model dates 1913. The flagship item
is "date and test the 1976 temperature acceleration".

**Hypothesis.** Annual temperature residuals about a trend are a stationary AR(1), not a unit root, so a
test on the levels (sup-F over one continuous hinge, Prais-Winsten AR(1), parametric bootstrap) has the
power the differences test lacks, and dates the late-century acceleration.

**What is fixed now.** Margin 0.15, 999 bootstrap replicates, seed 1, guard at bias-corrected rho 0.9.
The generator's rho (from the straight-line or the hinge residuals) is chosen on synthetic size alone
(`eval/hinge-test-sim.mjs`), before the real run, and recorded in the README with the size table.

**Series and predictions.**

- A. GCAG annual 1880-2024 (`data/global-temp-annual.csv`, the existing fixture): p <= 0.01, knot in 1960-1985.
- B. GISTEMP annual 1880-2024 (`data/gistemp-annual.csv`, same retrieval, a second analysis of largely
  the same raw readings, so not independent evidence): p <= 0.01, knot in 1960-1985.
- C. GCAG annual 1850-2024 (`data/gcag-annual-1850.csv`, longer): p <= 0.01, knot in 1960-1985.
- D. Unit-root controls, where the guard should refuse: log US real GDP (`data/us-real-gdp.csv`) and log
  US labour productivity (`data/us-labor-productivity.csv`).
- E. Windows of A (1910-2024 and 1930-2024): reported, no prediction.

**Bar.** The test ships as an option (CLI `--hinge-test`, agent tool) if A and B both meet their
prediction and both D series are refused, and synthetic size at p <= 0.05 is within 2-8% in every
cell. If A or B fails, the README records the negative result and nothing ships in the CLI.

The dates are recalled from the literature (slope changes near 1910, 1940 and the mid-1970s), not read
from a source here, so a knot in the window is a plausibility check, not a labelled test.
