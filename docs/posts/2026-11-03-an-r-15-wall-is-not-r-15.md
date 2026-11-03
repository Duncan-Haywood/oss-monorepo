---
title: "An R-15 wall is not R-15: measuring what the framing takes out"
seo_title: "Effective R-value of a 2x4 wall with R-15 batts, from the framing"
date: 2026-11-03
tags: [construction, insulation, calculators, open-source]
description: "A free insulation calculator places every stud and header in a 40 x 30 ft house, then counts batt bags and the whole-wall R-value: R-13.1 for 2x4 with R-15."
---

The label on a batt gives the R-value of the batt. A wall also has studs, plates, headers and cripples, and wood conducts heat about R-1.25 per inch against R-3.7 per inch for a batt, so the whole wall is worse than the label.

The wall framing takeoff already places every member of a house. The new [insulation calculator](https://marisstella.app/wall-framing-takeoff/insulation-calculator.html) uses that layout instead of a framing-factor guess. For a 40 x 30 ft rectangle with 8 ft walls, one door and two windows, at 16 in on center:

| Framing | Open cavity | Bags (88 sq ft, 5% waste) | Whole-wall R (parallel path) | Through the cavity alone |
|---|---|---|---|---|
| 2x4 with R-15 | 890 sq ft | 11 | R-13.1 | R-16.9 |
| 2x6 with R-21 | 882 sq ft | 11 | R-17.8 | R-22.9 |

With the framing as placed, framing is 16.6% of the 2x4 wall panels. The usual 25% guess would give R-11.9 for the 2x4 wall, so on this layout that guess is too pessimistic. Layer values (drywall, sheathing, air films) are typical handbook defaults you can overwrite; it is not an energy-code check, and windows, doors, attic and air leakage are outside it.

These figures come from the engine in the repository and are pinned in its page test, which fails if the page text and the engine disagree. No real house or supplier takeoff has been compared yet, so treat the bag counts as an estimate.
