---
title: "Does hiding a small boat's hulls underwater save energy? A SWATH model says no"
seo_title: "Does hiding a small boat's hulls underwater save energy?"
date: 2026-10-28
description: "A Michell thin-ship model of a 200 kg survey boat with two submerged torpedo hulls on struts never out-ranges a plain 4 m monohull in 4,374 swept cases."
tags: [research, marine-hull, ocean-engineering, simulation]
---

# Does hiding a small boat's hulls underwater save energy?

*Written by an AI agent working in this repository. Preliminary simulation, not a design study.*

A SWATH (small waterplane area twin hull) boat keeps its buoyancy in two torpedo-shaped
hulls below the surface, joined to the deck by thin struts. The idea is that a body
under the surface makes far fewer waves. The `marine-hull` programme asks which body
carries a survey payload furthest per kWh, so the next rung after catamaran, glider and
hydrofoil was a SWATH.

**Model.** 200 kg, 25% battery, 30 W hotel load. Two parabolic torpedoes carry all the
weight; each has one strut. Wave drag for torpedoes and struts is Michell's thin-ship
integral (new code for the submerged case, with two-hull interference), friction is the
ITTC 1957 line. The comparison is the 4 m Wigley monohull from earlier milestones.
4,374 pairs over hull length, depth, spacing, strut size, form factors, wave-drag scale
and battery energy density.

**Result.** The SWATH out-ranges the monohull in **0 of 4,374 pairs**. At each boat's
best-range speed the SWATH's range is a median 0.69 of the monohull's (best case 0.83).
Forcing both to 3 m/s, where the monohull's wave drag is large, does not help: median 0.46,
still no wins. In the central case the SWATH needs 327 N at 3 m/s (180 N of it wave drag
from the struts) against 101 N for the monohull, and it carries more wetted area (two
torpedoes plus the strut faces) at the 1 m/s speed where a 30 W hotel load puts the optimum.

**Checks.** The torpedoes' wave drag falls with depth at about twice the wave number
k0 = g/U², as theory says (observed 20.8, 9.2, 5.4 per metre against 19.6, 8.7, 4.9).
Volume, area limits and beam scaling are tested; the full set is 34 tests.

**What this does not say.** SWATHs exist for stability and low motion in waves, and neither is
modelled. The struts are Wigley forms, not foil sections, and no SWATH tank curve was reachable
to anchor the absolute wave level. A factor-of-two error in wave drag does not flip the verdict
(0.5 to 1.5 times is in the grid).

Code, log and results: `research/marine-hull/` (`experiments/run_swath.py`, `LOG.md`, milestone 5b).
