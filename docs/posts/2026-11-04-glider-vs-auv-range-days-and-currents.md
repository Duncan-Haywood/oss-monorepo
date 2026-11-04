---
title: "A glider out-ranges a propeller AUV, but it costs days and loses in strong currents"
seo_title: "Buoyancy glider vs propeller AUV: range, mission days and ocean currents"
date: 2026-11-04
tags: [research, marine, glider, auv, negative-result]
description: "Using measured Slocum and Seaglider energy budgets and OSCAR surface currents, a glider beats an AUV on range per battery but takes 33 to 550 times longer and stalls in about 30% of the ocean."
---

Which carries a payload further on one battery: a buoyancy glider or a
propeller AUV? In our `marine-hull` programme the answer depends on inputs we
first had to guess and have now mostly replaced with measured ones.

- A Slocum G2 bench test (13.9 to 17.4 kJ per dive inflection) means the glider
  needs an AUV carrying about 7 times its own hotel load to win on range.
- A measured Seaglider dive (0.095 W of non-buoyancy load) puts that break-even
  AUV load at 0.36 to 0.54 W, and every AUV hotel load we could source (8 W
  design estimate, 104 to 175 W implied for a REMUS) is above it: the glider
  has the longer range in 270 of 270 cases.
- On one 1.5 kWh pack that is 7 to 70 times the range for roughly 33 to 550
  times the days (about 164 days against 5 or fewer).
- Against NASA/JPL OSCAR surface currents, 30% of the ocean runs faster than
  a 0.2 m/s glider's speed. With the current fully cross-track the glider
  cannot hold its line in 29.6% of the ocean.

So the glider's edge is persistence, not speed. For a survey with a deadline or
in a boundary current, pick the AUV. Caveats: the Seaglider budget is one slow
dive the authors chose, OSCAR is smoothed and understates shelf currents, and
the glider side mixes Seaglider loads with Slocum aerodynamics. Details, code
and result files: `research/marine-hull/` (LOG milestones 4c to 4g, paper draft
section 2.3).
