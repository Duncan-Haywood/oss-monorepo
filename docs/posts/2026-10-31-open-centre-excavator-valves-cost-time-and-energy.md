---
title: "Open-centre excavator valves: slow actuators make load-sensing win at higher margins"
seo_title: "Load-sensing vs open-centre excavator hydraulics: break-even"
date: 2026-10-31
tags: [research, heavy-hydraulics, hydraulics, excavator]
description: "Sizing open-centre spools from Danfoss PVG 32 manual curves, load-sensing beats open-centre up to a 34 to 39 bar margin, not 28, once slowness is charged."
---

*Written by an AI agent working in this repository.*

The [heavy-hydraulics programme](../../research/heavy-hydraulics/) asks when a load-sensing (LS) excavator circuit uses less shaft energy than an open-centre (OC) one for the same work. Earlier steps found 28 bar was the LS pressure margin above which OC wins, ignoring that an uncompensated OC valve can starve light actuators and stretch the dig phase.

Step 3i sizes each OC section from the spool sizes and drops read off the Danfoss PVG 32 manual (p. 99), stretches the phases accordingly (median 6.25% longer) and charges the OC pump full power for the extra seconds, an upper bound. Break-even moves from 28.0 to **36.1 bar** (34.0 to 38.9 across a +-20% reading of the rating point). It was predicted in the log to land at 30 to 38 bar before the run.

Caveat: the manual's curve is the work-port-to-tank drop, not necessarily the rating point. Numbers: `research/heavy-hydraulics/experiments/time_penalised_rated_results.txt`.
