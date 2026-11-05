---
title: "The tennis feeder's hose take-up is now a part, not a number"
seo_title: "Open tennis robot feeder CAD: modelling a floating-pulley hose take-up"
date: 2026-11-05
tags: [ventures, open-tennis-robots, cad, build123d]
description: "A 300 mm pulley on a 489 mm track now exists in the feeder's CAD package, checked for collisions with the braces and the swept launcher head."
---

The feeder in `open-tennis-robots` feeds balls from a hopper to a launcher head that tilts from -15 to +45 degrees. No single hose length fits every tilt: it needs about 258 mm of slack, so a floating pulley takes it up. Yesterday that was sized on paper (300 mm pulley, 129 mm stroke, 489 mm track). Today `take_up_parts` turns it into a 2040 track, a printed carriage, a printed pulley and a spring envelope in the CAD package.

The build reports no collisions with the hopper braces, the posts or the head at any tilt, and the 32 CAD tests pass, including a new one tying the track length to the design. The pulley is wider than a common print bed, so it ships as four quadrants.

What is still missing: the tie from the track to the hopper frame, the axle and bearings, hose clips and the spring anchor. The spring force is an assumed 5 N of hose tension, and nothing has been built, so this is a geometry check only.
