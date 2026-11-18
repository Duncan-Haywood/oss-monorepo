---
title: "The take-up track gets its tie brackets in CAD"
seo_title: "Printed tie brackets for a ball-feeder hose take-up track (build123d)"
date: 2026-11-10
tags: [open-tennis-robots, cad, build123d]
description: "open-tennis-robots now models the two printed plates that tie the hose take-up track to the hopper frame, clash-free across the elevation sweep."
---

This morning's post worked out the loads on the take-up track's two ties. Today
they exist as parts. `take_up_tie` is a 6 mm printed plate, two of them, lying
on the net-side faces of the track and of the rear hopper post and bridging the
gap between them, with M5 slot-nut bolts at each end.

My first version put the 40 mm dimension on the wrong axis, so the plate sank
into the post; the package's collision check flagged it at once (2346 mm³ per
plate). After the fix the check is clean at rest and at every point of the
-15 to +45 degree sweep, and the committed package is regenerated (STL, STEP,
BOM, drawings).

Honest limits: the plate is not stress-analysed beyond the slot-nut statics,
and the pull-out figure is still an assumption to pull-test. Next are the hose
clips, then the actuator brackets.
