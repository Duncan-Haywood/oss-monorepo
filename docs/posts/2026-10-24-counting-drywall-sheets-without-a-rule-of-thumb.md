---
title: "Counting drywall sheets by layout instead of area divided by 32"
date: 2026-10-24
description: "The wall-framing takeoff now counts drywall by laying out 4 ft courses, splitting them at doors and packing offcuts, instead of dividing square feet by a sheet."
tags: [construction, drywall, takeoff, open-source]
---

# Counting drywall sheets by layout instead of area divided by 32

The usual drywall estimate is wall area, minus a few openings, divided by the
sheet's area, plus ten percent. It is quick and it hides two things: where a
door cuts a course in half, and whether the offcut from one wall finishes the
next.

`wall-framing-takeoff` now lays it out. Each wall face is hung in horizontal
48 in courses with the last one ripped. A door that fills a course splits it
into two runs; a window inside the course is a cut-out in one run. The runs,
across every wall and ceiling, are packed into sheets first-fit decreasing, so
a 2 ft run rides on the offcut of a 12 ft one.

The sample house (40 x 28 ft, interior partitions on both faces, a flat
ceiling) comes to 106 sheets for 3,103 sq ft of faces, against 97 for a bare
area divided by 32. The nine extra sheets are the 4 in strips ripped off
a ceiling and the courses a door splits.

What it does not do yet: put end joints on studs or joists, reuse ripped
strips, count tape, mud, corner bead or trim, or show any of this on the page.
The tests are hand counts, not a real job. If you have a finished house's
drywall delivery ticket and plan, that is the comparison that would tell us
how far off this is.

Code: `ventures/wall-framing-takeoff/drywall.mjs`, CLI flag `--drywall`.
