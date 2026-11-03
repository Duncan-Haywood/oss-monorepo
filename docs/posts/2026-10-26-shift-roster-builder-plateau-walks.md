---
title: "Checking a shift scheduler against an independent solver found a search gap, not a proof gap"
seo_title: "Shift scheduler vs an independent solver: a search gap"
date: 2026-10-26
description: "Eight seeded 10-person, 28-shift weeks, checked against HiGHS: two weeks left more shifts open than needed, and more search steps fixed one."
tags: [shift-roster-builder, scheduling, optimization]
---

[shift-roster-builder](../../ventures/shift-roster-builder/) builds a weekly roster and proves how many shift hours must stay open. Earlier checks used four seeded weeks per size. Running all eight 10-person, 28-shift weeks through the independent HiGHS integer program showed two where the roster left 94 h and 65 h open while the optimum was 89 h and 61 h. The proven floor already equalled the optimum, so the search was the weak part.

The coverage plateau pass ran three times. Twelve runs at four times the steps brought week 5 to the optimum and week 7 to 62 h against 61 h; thirty runs, or eight times the steps, stayed at 62. The other six weeks matched the solver. Raising the branching budget on the floor changed nothing.

Synthetic weeks, hard rules only (availability, rest gap, weekly cap), one seed set. The last hour needs a different move, not more of the same.
