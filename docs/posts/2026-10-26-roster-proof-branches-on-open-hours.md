---
title: "Proving the fewest open shifts: branching on the price closes 5 of 7 gaps"
date: 2026-10-26
description: "The shift roster builder now proves its roster leaves the fewest possible hours open on 10 of 12 seeded weeks, up from 5, against an independent solver."
tags: [shift-roster-builder, optimization, scheduling]
---

[Shift roster builder](../../ventures/shift-roster-builder/) finds a roster, and it also tries to prove nothing better exists. The proof side lagged: its floor on open hours sat below the true optimum on 7 of 12 seeded weeks (8, 10 and 12 people), so "this is as good as it gets" could not be claimed.

The floor prices every shift and lets each person pick their best feasible set; the leftover is a duality gap, because a contested shift is split between people. The engine already branched on that price for the pay bound. This change runs the same branching on the open-hours bound alone, fixing the most contested shift to each candidate or to "open" and re-pricing. A bound from any partial tree is still valid, so it is rounded up to the shifts' hour grid and used.

Against an independent HiGHS integer program on the same 12 weeks, the floor now equals the optimum on 10, with two still short (by 1 h at 10 people x 28 shifts, by 3 h at 12 x 30). It never exceeds the optimum. The synthetic weeks cover hard rules only, and one run was timed beside the test suite, so treat the numbers as a direction. Details and the table: the venture README.
