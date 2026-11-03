---
title: "Nail counts checked against 300 random houses"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A seeded fuzz test now checks that the framing takeoff's nail counts add up across 300 random wall plans, and found nothing wrong.
---

The framing takeoff counts nails by connection: stud ends, plates, jacks to kings, header plies, sheathing edges. A count like that can be wrong quietly, because a missing connection still gives a plausible total.

`fasteners-fuzz.test.mjs` builds 300 random wall plans (different lengths, openings, tees, corners, sheathed or not) with random nailing schedules, and checks properties that must always hold: the connection rows and the per-wall rows both sum to the total, the order is never below the count, whole boxes cover the order, tighter plate spacing never gives fewer nails, and a wider hold-down threshold never counts more hold-downs. Out-of-range settings must be refused with a reason.

It found no bug. That is a result worth stating plainly: the arithmetic is consistent. It does not show the schedule matches what a real framer nails; the defaults are common practice, not a code table, and no real nailing schedule has been compared yet. If you frame houses and would send one, that is the useful next step.
