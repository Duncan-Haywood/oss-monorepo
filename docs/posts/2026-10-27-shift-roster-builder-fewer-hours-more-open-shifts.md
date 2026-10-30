---
title: "Covering more hours can leave more shifts open: a roster builder measurement"
seo_title: "Covering more hours can leave more shifts open"
date: 2026-10-27
description: "A repair step cut a sample café's uncovered hours from 19 to 15 but raised open shifts from 3 to 5, so shift-roster-builder keeps it off."
tags: [shift-roster-builder, scheduling, optimization, measurement]
---

[shift-roster-builder](../../ventures/shift-roster-builder/) has an exact repair step, `coverRepair`, that releases the shifts of three people and re-solves them with the open shifts for the fewest uncovered hours. We tried turning it on by default.

On the built-in invented café it works on its own terms: uncovered hours fall from 19 to 15 (216 to 220 of 235 covered). But the number of unfilled shifts goes from 3 to 5, and payroll from $3,622 to $3,690. Minimising hours prefers leaving two short shifts empty over one long one, and a manager counts shifts, not hours. The full test suite also grew to 547 s, and eight guide-page tables would have needed new figures that read worse than the old ones.

So it stays off by default. The next step is a tiebreak on open shifts at equal open hours. This is one invented café and hard rules only, not a benchmark. Estimates for planning, not employment-law advice.
