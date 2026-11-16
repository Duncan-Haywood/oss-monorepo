# Pre-registration: two changes of slope against a straight line (2026-11-16, after "The hinge test on the logs")

Written and committed before any run below. Context: README, "Step or bend? ... the test on eight fresh real series"
and "The hinge test on the logs": `--hinge-test` refused 7 of 8 real series under 100 points because the residuals
about the best single hinge stayed sticky (bias-corrected rho 0.71-0.95), and both sections named "a second hinge" as
the remaining route, needing its own size check at n 40.

**What exists before the run.** `two-hinge.mjs` (`twoHingeTest`): the one-hinge procedure with two knots (sup-F with 2
and n - 4 degrees of freedom over knot pairs, each knot 15% from either end and the two at least 15% of n apart; rho
from the best OLS two-hinge fit; GLS by Prais-Winsten; bootstrap from the GLS line plus AR(1) noise with the line's
bias-corrected rho) and the one-hinge `cut` guard with two hinges in place of one (random-walk cut bar recomputed for
two hinges, 299 walks, seed 7). Looked at so far: a smoke run on one planted series and 60 development series per
cell (seeds 900,000-900,059: plateau rises 0.15 and 0.25 per step and a null, n 60, rho 0.5) to check speed and that
power is above size; those seeds are not reused. The random-walk cut bars at n 40, 60 and 95 were printed (0.82, 0.64,
0.40): they depend on n only, and they inform the predictions below. No real series has been run through
`twoHingeTest`.

**Fixed now.** Margin 0.15. Synthetic: 300 series per cell, 99 bootstrap replicates, seeds from 64,000,000 (never used,
a block of 100,000 per cell), `eval/two-hinge-sim.mjs`, the generator of `eval/hinge-log-sim.mjs` (line 0.02 t plus
AR(1), innovation sd 1; rho 1 is a random walk with drift 0.02 started at 0). Real: 999 replicates, seed 1,
`eval/two-hinge-real.mjs`, annual totals of full calendar years as in `eval/hinge-log-real.mjs`.

**Bars.** Shares are of **all** series with p <= 0.05; a refusal counts as not rejecting.

- S1 (size). Straight line plus AR(1), rho 0, 0.3, 0.6, 0.8, at n 40, 60 and 95: at most 8% in every one of the 12
  cells.
- S2 (unit roots). Random walk with drift 0.02, and AR(1) rho 0.9 and 0.95, at n 40, 60 and 95: at most 8% in every
  one of the 9 cells.
- P (power over one hinge). Plateau: flat to t = n/3, rising 0.25 a step to t = 2n/3, flat after, AR(1) rho 0.5, n 60.
  The two-hinge test rejects in at least 10 percentage points more of all series than the shipped one-hinge test
  (`hingeTest`, guard `cut`, same replicates) on the same series.
  Reported, no bar: the same plateau at n 95, and a 0.15 rise at n 60.

**Real predictions** (each a separate line; none decides the ship):

- R1 Australian gas, annual totals 1956-1994 (39): refused (the cut bar at n 40 is about 0.8, and the one hinge left
  rho 0.83).
- R2 US electricity, annual totals 1973-2012 (40): refused (line rho 0.82 would need a two-hinge rho near 0).
- R3 US female murder rate 1950-2004 (55): tested, p <= 0.05, one knot in 1958-1975 and the other in 1985-1998 (a rise,
  a plateau, a fall).
- R4 Canada fertility 1931-1968 (38): refused.
- C Lake Huron 1875-1972 (98) and Michigan-Huron 1918-2009 (92): refused or p > 0.05.
- G GCAG 1880-2024 (145): tested, p <= 0.05, one knot in 1965-1985.

Reported, no prediction: CO2 annual means 1959-2025 (67); the Nile (100; the one-hinge test falsely rejected it, the
drop of 1898 is a step).

**Decision.**

- S1, S2 and P hold: `twoHingeTest` ships as an option (`analyze({ twoHingeTest })`, CLI `--two-hinge-test`), with the
  measured size, power and real results in the README, whatever R1-R4 show.
- S1 or S2 fails in any cell: not offered (kept for evaluation); the README records which cells fail.
- S1 and S2 hold, P fails: not offered; a second hinge costs power where one fits and gains too little where two do.
