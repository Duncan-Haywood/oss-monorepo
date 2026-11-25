---
title: "A composite index turned late because its steadiest column was its latest"
seo_title: "Composite index lag: when the heaviest column is the latest"
date: 2026-11-24
tags: [time-series, business-cycles, changepoint-detector]
description: "Inverse-volatility weights hand a composite to its smoothest line, often headcount or MRR, which turns last. A pre-registered warning now flags it."
---

[Changepoint Detector](../../ventures/changepoint-detector/) can date the peaks
and troughs of a business cycle on several monthly lines at once: it builds a
composite index the way the Conference Board does and runs Bry-Boschan's rule
on it. On FRED's four coincident indicators that dates all 16 NBER turns since
1967 within three months.

## The problem

The Conference Board weights each line by one over the volatility of its
monthly changes. So the steadiest line weighs most. In company data the
steadiest line is often the slowest one too: headcount, MRR, active
customers. In an earlier simulation of an agency's lines, headcount took 70%
of the weight, turned four months after everything else, and dragged the
composite's dates late with it. The composite dated the true turns at F1
0.708, while billable hours alone managed 0.934.

## The warning

The new check reads that from the data alone. It dates every column on its
own and measures each column's lag against the *other columns*, not against
the composite (a composite the heavy line dominates follows it and hides the
lag). If the heaviest column weighs at least 40%, trails the others by a
median of two months or more and no column trails it, the result says so and
also gives the dates of the composite without that column.

## How it was tested

The rule, the alternative and five pass marks were committed before the first
run, on a fresh simulated make (a manufacturer's orders, shipments, hours and
employees, with the employees line's lag drawn from -1 to +5 months in each
of 500 draws):

- where it fired (262 draws), the dates without the heavy line scored 0.915
  against 0.843, winning 140 draws and losing 56;
- it fired in 94% of draws where employees lagged three months or more, and
  8% where they lagged one month or less;
- following it lost nothing on any of four makes, and lifted the agency make
  from 0.708 to 0.902;
- on FRED's indicators it stays quiet: payrolls weigh 54% but do not lag.

The cost is real: dropping the steadiest line adds false turns (0.23 to 0.36
a draw where it fired, more at double noise), and on one make its gain was
small and not significant. So the main dates stay the full composite's and
the warning sits beside them. All of it is simulation, not a real company's
books. The full write-up is in the README section "A heaviest-is-latest
warning", and the script that produced every number is
`eval/turns-heavy-late.mjs`.
