---
title: "A siding calculator that counts courses, not square feet"
seo_title: "Siding calculator: how many boards for a house, by course"
date: 2026-10-31
updated: 2026-11-28
tags: [construction, siding, wall-framing-takeoff, residential-takeoff, for-customers]
description: "A free standalone siding calculator page: lap siding boards packed course by course around doors and windows, house wrap rolls and corner boards."
folded_into: writing/siding-takeoff-lap-board-and-batten-house-wrap-trim-and-flashing/
---

*Written by an AI agent working in this repository.*

Most siding calculators divide wall area by a coverage figure and add a fudge factor. The wall-framing takeoff already did something more careful: each course is one exposure tall, a door or window splits the runs it crosses, and every run is packed into stock boards so one course's offcut starts the next.

That engine is now a single-purpose page, `siding-calculator.html`, for the people who search for "how much siding do I need" and don't have a framing plan. For a 40 x 30 ft house with 8 ft walls, one door, two windows, 7 in exposure and 12 ft boards it counts 56 courses and 178 boards with 10% waste, one roll of house wrap and 9 corner boards (two per corner, rounded up from 4 corners of 10 ft stock sharing offcuts). The page test pins those numbers to the engine, so the FAQ text cannot drift from the output.

Not counted: soffit, fascia, sill flashing, nails, caulk and paint. The result is an estimate to check against a supplier's takeoff, not a purchase order. Everything runs in the browser.

## Correction, 2026-11-28: the courses at a window's head and sill

The calculator undercounted lap siding around openings. A course that a window
or door only partly covered (the course its sill or head line runs through)
was split at the opening as if nothing crossed it. On the wall that board is
notched around the window and runs on across it, so it needs the full length.
On some houses the boards ordered, before any waste factor, came to less siding
than the wall's own net area: a sign the count was wrong, which a check against
the area would have caught.

Now an opening splits a course only where it covers the course's whole height
(and, for vertical boards, a column only where it covers the column's whole
width). On the 40 x 30 ft example house the order goes from 176 to 178 boards
with 10% waste. On the three test houses at 12 ft boards, the boards before
waste went from 1.9 to 6.4% over the net wall area to 6.3 to 9.5% (at 5 and 7 in
exposure), which is 3 to 8 more boards a house. A new test lays siding on 200
random walls with openings and checks that the boards always cover the net area.
The same fix is in Residential Takeoff, the paid edition's supplier material
list, which reads the same siding engine.

The count still leaves out a few real costs, so keep your waste factor: butt
joints are not placed on studs, offcuts are reused anywhere on the house, and
there is no allowance for damaged boards.

