# Pre-registration: the hinge test on the log scale, and at n 40 (2026-11-15, after "Step or bend, as two tests")

Written and committed before any run below. Context: README, "Step or bend? ... the test on eight fresh real series":
`--hinge-test` refused 7 of 8 real series under 100 points, and its "Next" named "a hinge on the log for growth
curves". `analyze({ log: true, hingeTest: true })` (CLI `--log --hinge-test`, the page's "Take logs first" box)
already passes the logged values to `hingeTest`, but that path has never been run on a real series, and the report
still calls it a test "on the levels". Nothing in this file has been looked at on the log scale: no real series has
been run through `hingeTest` on logs, and no synthetic series of length 40 has been run through it at all.

**Why size needs a new cell.** On logs the test is the shipped procedure applied to log x, so under "log x is a line
plus AR(1)" its size is whatever the shipped test's size is at that n. The two growth series that motivate this
(Australian gas and US electricity, annual totals) have 39 and 40 points, and the shipped size and walk tables start at
n 60. So the synthetic half is the shipped test (guard `cut`, the default) at n 40, which a log user would meet.

**Fixed now.** Margin 0.15, guard `cut`. Synthetic: 300 series per cell, 99 bootstrap replicates, seeds from
63,000,000 (never used), `eval/hinge-log-sim.mjs`, the generator of `eval/hinge-cut-guard-sim.mjs` (line 0.02 t plus
AR(1), innovation sd 1; rho 1 is a random walk with drift 0.02 started at 0). Real: 999 replicates, seed 1,
`eval/hinge-log-real.mjs`, annual totals of full calendar years as in `eval/hinge-step-or-bend-real.mjs`.

**Bars.**

- S1 (size, n 40). Straight line plus AR(1), rho 0, 0.3, 0.6, 0.8: share of all series with p <= 0.05 (refusals count
  as not rejecting) at most 8% in every cell.
- S2 (unit roots, n 40). Random walk with drift 0.02, and AR(1) rho 0.9 and 0.95: at most 8% in every cell.
- L (real, on logs). At least one of L1, L2 holds:
  - L1 Australian gas, annual totals 1956-1994 (n 39): tested, p <= 0.05, knot 1966-1976, slope after below slope
    before (fast growth from a small base slowing to a steadier rate).
  - L2 US electricity, annual totals 1973-2012 (n 40): tested, p <= 0.05, knot 1998-2008, slope after below slope
    before.
- C (controls on logs, all must hold): Lake Huron 1875-1972 and Michigan-Huron 1918-2009 refused (logging a lake level
  hundreds of feet above datum barely changes its shape, so it should refuse as on the levels); US female murder rate
  1950-2004 refused (a rise and fall: logs do not make it one bend); log US real GDP and log US labour productivity
  are already logs in the shipped bar R and must still be refused (same call as before, no new run needed beyond the
  existing test).

Reported, no bar: CO2 annual means 1959-2025 on logs (prediction: refused, since logging barely bends a smooth
acceleration at these growth rates); Canada fertility 1931-1968 on logs (no prediction).

**Decision.**

- S1, S2, C and L hold: the log path is documented and shipped as a recommended use. The report and the page say "on
  the logs" when logs are on, and a refusal on a series whose values are all positive says to try logs if the series
  grows by a percentage.
- S1 or S2 fails: the shipped test is not honest at n 40; the README records it and the minimum length of the hinge
  test is raised to the smallest n at which the shipped cells hold (60 has measured tables), whatever L shows.
- S1 and S2 hold but L fails, or C fails: the log path stays as it is (no hint), the report still says "on the logs"
  when logs are on (that is a wording fix, true either way), and the README records the miss.
