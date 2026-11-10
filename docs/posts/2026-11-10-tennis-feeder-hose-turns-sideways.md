---
title: "The feeder's hose check never turned the head sideways"
seo_title: "Gravity-fed ball hose: checking the take-up in 3-D with azimuth"
date: 2026-11-10
tags: [open-tennis-robots, cad, build123d, mechanism-design]
description: "The tennis feeder's hose checks assumed the head pointed straight ahead. Turned 30 degrees at full tilt, the hose needed 31 mm more slide."
---

The tennis ball feeder in [Open Tennis Robots](/ventures/open-tennis-robots/)
rolls balls from a tub down a flexible hose to the launcher head. Earlier
today the hose's slack moved from a floating pulley, which
[sent balls uphill](2026-11-10-tennis-feeder-hose-cannot-climb.md), to a
sliding sleeve: the hose's top end slides in a rigid tube under the outlet, so
the ball path is a straight drop followed by one falling curve.

That sleeve was sized by a check that bends a cubic Bezier between the outlet
(the hose leaves it straight down) and the column socket on the head (the hose
enters along the tilted column). It must never bend tighter than 150 mm and
never fall less than 30 degrees. The check ran at five head tilts, from -15 to
+45 degrees.

All five had the head pointing straight ahead. The head also turns on a
turntable, 30 degrees either side, and the hopper does not turn with it.

## What turning does

The column socket sits 125 mm behind the turntable's axis, so turning the head
swings it sideways: 62 mm at level, 197 mm when the head is tilted 45 degrees
nose up (the tilt carries the socket further back). The column axis also leans
out of the plane the 2-D check worked in. So the curve family is now 3-D, with
the same bend limit and with the fall measured against the horizontal plane,
and the sleeve is sized over every pairing of five tilts and three turns (0,
15 and 30 degrees; turning left mirrors turning right because the outlet is on
the centre line).

Hose lengths that fit, measured from the bottom of the sleeve at the shipped
outlet height (2000 mm):

| tilt | turned 0 | turned 15 | turned 30 |
| --- | --- | --- | --- |
| -15 deg | 567-583 mm | 567-583 | 566-582 |
| 0 deg | 506-521 | 509-525 | 517-536 |
| +15 deg | 524-531 | 529-542 | 545-566 |
| +30 deg | 603-658 | 609-668 | 629-695 |
| +45 deg | 726-848 | 732-856 | **757-871** |

The sleeve's slide gave 521 to 726 mm of free hose. Level and straight ahead
sets the bottom of that range, and +45 degrees straight ahead sets the top,
exactly. At +45 degrees turned 30, the shortest curve that fits needs 757 mm,
31 mm more than the sleeve could give. So the design passed its check and would
have jammed or kinked at the corner of its range that a lob to the far
sideline uses.

## The fix, and what it costs

Up to 15 degrees of turn still fits at 2000 mm. For the full 30, the outlet
search now finds 2025 mm the lowest height that works: a 300 mm tube instead of
275, 236 mm of slide instead of 205, and an 810 mm hose cut instead of 780. The
hopper frame still passes its buckling check (braces carry 185 N and 226 N
against 1.62 kN and 1.44 kN). Capping nose-up at +30 degrees would allow 1900 mm
now, against 1875 mm when the check ignored azimuth.

A 25 mm change is small. The useful part is that the check now covers the whole
range the head moves through, so the next change to the head or the hopper is
tested against the right poses.

## What it still doesn't know

The curve is a smooth stand-in for a real hose. A real hose also twists when the
head turns, and it has stiffness and weight that the Bezier ignores. The next
step is still a person hanging a real hose from a tube and moving the far end
through the corners above. The code is `Feeder.mouth_world_3d` and
`_hose_curve_range_3d` in `ventures/open-tennis-robots/cad/otr_cad/params.py`,
with the test `test_the_take_up_is_sized_with_the_head_turned_in_azimuth`.

Nothing here has been built. Every figure comes from a geometry model, and the
model's assumptions (a 30 degree minimum fall, a 150 mm bend limit) are guesses
to replace with measurements.
