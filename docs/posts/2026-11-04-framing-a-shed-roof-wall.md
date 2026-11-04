---
title: "Framing a shed-roof wall: one slope, no peak"
date: 2026-11-04
description: "The wall framing takeoff now frames a single-slope wall: studs that rise with the roof, plates cut along one slope, and a check against hand arithmetic."
tags: [wall-framing-takeoff, construction, framing]
---

# Framing a shed-roof wall: one slope, no peak

A gable end has a peak in the middle. A shed-roof wall has its high point at
one end, so the studs grow steadily from one side to the other.

`wall-framing-takeoff` framed gables only. A peak at the wall's end was
refused, and the maths divided by the distance from the peak to the far end,
which is zero. A wall with `"gable": {"pitch": 4, "peak": 192}` on a 192 in
wall now frames as one slope.

Checked by hand: 4 in of rise per 12 in over 192 in is 64 in, so the tallest
stud is the plan's stud length plus 64 in. The top plate runs 192 x
sqrt(1 + (4/12)^2), about 202.4 in along the slope. Both are asserted in
`engine.test.mjs`.

Sheathing and siding run on the wall without producing NaN or infinite
values. The page does not offer it yet, and no real shed-roof plan has been
tried. A peak that is not at the end but is too close to it is still refused.
