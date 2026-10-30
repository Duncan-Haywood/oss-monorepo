---
title: "How much corner bead does a stub wall need? Counting the ends drywall wraps"
seo_title: "How much corner bead does a stub wall need?"
date: 2026-10-24
description: "Drywall takeoffs count bead around windows and doors but miss free wall ends. A worked count, and how the framing takeoff tool now does it."
tags: [construction, drywall, takeoff, estimating]
---

# How much corner bead does a stub wall need?

Corner bead protects every outside corner where drywall turns a corner. Most
takeoffs count it around door and window openings: two jambs and a head. A wall
that simply stops in the room (a pony wall, a stub partition) has an outside
corner too, and it is easy to leave out.

## The count

A free end is one full-height run of bead for each drywalled face.

- A 16 ft partition, 8 ft high, drywalled both sides, with one free end:
  1 end x 2 faces x 8 ft = **16 ft** of bead.
- The same partition with both ends free: **32 ft**.
- An exterior wall drywalled on its inside face only, one free end: **8 ft**.

At 8 ft sticks with 10% waste, 16 ft is 3 sticks (16 x 1.1 / 8 = 2.2, rounded up).

## In the tool

The free [wall-framing takeoff](../../ventures/wall-framing-takeoff/) now reads
a `freeEnds` value (0, 1 or 2) on each wall and adds these runs to the bead count
it already makes for openings. The plan states which ends are free; the tool does
not guess from geometry. The three counts above are tests in `drywall.test.mjs`.

Not covered yet: bead on ceiling steps, trim, and a page field for `freeEnds`
(it is set in the plan JSON today). Bead is a rule of thumb for what to order;
check the layout against your drawings and local practice.
