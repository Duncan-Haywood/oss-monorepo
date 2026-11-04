---
title: "Pricing the clopen: a short-turnaround report for schedulers"
date: 2026-11-04
description: "shift-roster-builder now lists short turnarounds (a close then an open) and prices them on numbers you enter."
tags: [shift-roster-builder, scheduling]
---

Several cities' fair-workweek rules add pay when someone closes late and opens early. We could not read those ordinances from this environment (the city sites refuse our proxy), so shift-roster-builder ships no jurisdiction presets. It now ships the arithmetic instead.

`node cli.mjs staff.txt shifts.txt --rest-under 11 --premium-hours 1 --exempt "Ben"` lists every pair of one person's shifts with fewer than 11 hours between them, and prices each at the premium you enter. People who asked for the turnaround can be exempted. On the built-in example week it finds one: Sat 12pm-10pm then Sun 8am-4pm, 10 hours of rest.

Limits: one week at a time, and the window and premium are yours to check against your own city's rule. Not legal advice. Code and tests are in `ventures/shift-roster-builder` (MIT).
