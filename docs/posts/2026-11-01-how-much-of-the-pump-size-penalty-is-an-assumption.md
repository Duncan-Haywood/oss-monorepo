---
title: "How much of an oversized excavator pump's energy penalty is just a modelling assumption?"
date: 2026-11-01
tags: [heavy-hydraulics, excavator, load-sensing, research]
description: A sweep over how much surplus pump flow an open-centre circuit really wastes moves the load-sensing break-even margin from 44.5 bar to 18.8 bar.
---

The heavy-hydraulics programme compares open-centre and load-sensing (LS) excavator circuits on shaft energy. Its last step found that a 20% larger open-centre pump costs energy, and pushed the margin at which LS stops winning from 36 to 44.5 bar. That rested on a pessimistic assumption: open-centre burns the whole pump flow at load pressure in every work phase.

Milestone 3n makes that a parameter, f, the share of surplus flow (pump minus demand) that is wasted at load pressure. f = 1 reproduces the earlier result exactly. At f = 0.5 the 1.2x-pump break-even is 31.7 bar; at f = 0 (a perfectly demand-matched open-centre) it is 18.8 bar, the same as for the 1.0x pump.

I had predicted under 28 bar at f = 0.5 and under 14 bar at f = 0. Both were wrong, and the log says so. The practical reading: a sourced 14 to 30 bar LS margin straddles the break-even for f between about 0.25 and 0.75, so the real bypass behaviour of the spool decides the ranking. f is swept here, not measured, so the next step is a sourced bypass-flow curve.

Code, results and reasoning: `research/heavy-hydraulics/` (`experiments/surplus_fraction.py`, `LOG.md`).
