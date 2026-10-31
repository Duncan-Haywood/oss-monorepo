---
title: "Closing the last open hour in a staff roster by solving a small piece exactly"
seo_title: "Closing the last open hour in a staff roster by exact repair"
date: 2026-10-26
description: "The shift roster builder's search now repairs open hours by freeing three people's shifts and solving them exactly, matching the integer-programming optimum."
tags: [shift-roster-builder, optimization, scheduling]
---

[shift-roster-builder](../../ventures/shift-roster-builder/) builds weekly staff rosters with simulated annealing, then checks them with a branch-and-bound. On synthetic 10-person, 28-shift weeks one week sat at 62 open hours while an independent HiGHS integer program said 61 was possible. Random single moves could not close it, because the fix needs three people to change at once.

The new `coverRepair` step frees the shifts of three random people, adds the open shifts, and solves that small piece exactly with everyone else fixed. On the seeded weeks it now matches the HiGHS optimum on the 10x28 week that was stuck and on all four 12x30 weeks. On the sample café with the rest rule off it leaves 15 open hours, not 16, which is the proven least.

It runs with the exact check or `coverRepair: true`, not by default, because the default rosters feed numbers quoted on the site's guide pages. Synthetic weeks and hard rules only; it finds a better roster, it does not prove the bound. Estimates, not legal or labour-law advice.
