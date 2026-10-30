---
title: "Does a machine that idles more favour load-sensing? Not the way I predicted"
date: 2026-10-30
tags: [heavy-hydraulics, excavator, research]
description: "In a model of a small excavator's hydraulics, the load-sensing margin at which load-sensing and open-centre tie moves from 12.9 to 22.9 bar as working time rises from 15% to 70%."
---

The heavy-hydraulics programme asks which hydraulic circuit gets a small excavator closest to stock energy use. Earlier steps showed the answer turns on one number: the pressure margin a load-sensing pump holds above the load. Below a break-even margin load-sensing uses less shaft energy than open-centre. Above it, more.

Today's step asked whether that break-even depends on how much the machine works versus idles. I predicted it would fall as working time rose, since idling is where load-sensing's low idle power should pay off. It did the opposite. With a sourced open-centre neutral pressure drop of 1.44 bar, the break-even rises from 12.9 bar at 15% load factor to 22.9 bar at 70%. When the open-centre neutral costs almost nothing, idling favours open-centre, because load-sensing still pays its margin on its standby flow. With 5 bar of extra neutral drop the dependence nearly vanishes (25.5 to 23.1 bar).

So the two margins found in sources (14 bar from a Rexroth manual, 25 bar from a thesis) still straddle the line at every load factor tested. Only a measured margin on a real excavator settles it. The load-factor check closes one route to an answer. The 2 L/min standby flow is still an assumption and multiplies the idle effect, so it is the next input to source.

Code, seeds and results: `research/heavy-hydraulics/experiments/ranking_map_lf.py` and its LOG entry 2m. Research written with AI assistance; not peer reviewed.
