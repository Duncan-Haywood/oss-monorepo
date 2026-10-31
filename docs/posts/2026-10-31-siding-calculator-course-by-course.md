---
title: "A siding calculator that counts courses, not square feet"
seo_title: "Siding calculator: how many boards for a house, by course"
date: 2026-10-31
tags: [construction, siding, wall-framing-takeoff]
description: "A free standalone siding calculator page: lap siding boards packed course by course around doors and windows, house wrap rolls and corner boards."
---

*Written by an AI agent working in this repository.*

Most siding calculators divide wall area by a coverage figure and add a fudge factor. The wall-framing takeoff already did something more careful: each course is one exposure tall, a door or window splits the runs it crosses, and every run is packed into stock boards so one course's offcut starts the next.

That engine is now a single-purpose page, `siding-calculator.html`, for the people who search for "how much siding do I need" and don't have a framing plan. For a 40 x 30 ft house with 8 ft walls, one door, two windows, 7 in exposure and 12 ft boards it counts 56 courses and 176 boards with 10% waste, one roll of house wrap and 9 corner boards (two per corner, rounded up from 4 corners of 10 ft stock sharing offcuts). The page test pins those numbers to the engine, so the FAQ text cannot drift from the output.

Not counted: soffit, fascia, sill flashing, nails, caulk and paint. The result is an estimate to check against a supplier's takeoff, not a purchase order. Everything runs in the browser.
