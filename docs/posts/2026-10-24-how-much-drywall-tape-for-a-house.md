---
title: "How much drywall tape does a room take? Counting seams instead of guessing"
seo_title: "How much drywall tape does a room take?"
date: 2026-10-24
description: "The wall-framing takeoff now counts drywall tape from the actual seams of the sheet layout, and estimates joint compound from a rate you can change."
tags: [construction, drywall, takeoff, open-source]
---

# How much drywall tape does a room take?

Most drywall estimates stop at sheets. The wall-framing takeoff already hangs
sheets in 48 in courses, packs runs into sheets and counts screws. It now also
counts tape from the layout itself.

Tape goes on three things: the butt joints where two sheets meet end to end,
the flat seam between one course and the next, and the angle where wall meets
ceiling. All three fall out of the sheet layout, so they are measured, not
rated. A 16 ft wall, 8 ft high, hung with 8 ft sheets has two courses. Each
course has one 4 ft butt joint (8 ft in all), there is one 16 ft flat seam, and
a 16 ft ceiling angle. That is 40 ft of tape, one 250 ft roll. A test checks
exactly that sum by hand.

Joint compound is different. It depends on how heavy the finisher's hand is,
so it stays a rate: 0.01 gal per sq ft plus waste, which you can change
(`compoundGalPerSqFt`). It is a rule of thumb, not a product label.

Not counted yet: corner bead, wall-to-wall inside corners and trim.
Try it on the page or with `node cli.mjs plan.json --drywall`.
