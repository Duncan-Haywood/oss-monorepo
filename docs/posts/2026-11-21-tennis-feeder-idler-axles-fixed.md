---
title: "Tennis robots: checking one bolt's length showed the idler wheels had the wrong kind of axle"
seo_title: "Tennis robots: a fixed idler axle instead of one cantilevered 608"
date: 2026-11-21
tags: [open-tennis-robots, cad, hardware]
description: "Making the feeder's idler wheel bolts checked joints showed each wheel hung off one bearing in a 5 mm plate. The axle is fixed now, and the wheel's own two bearings carry it."
---

The open tennis robots' feeder sits on four 150 mm wheels. The CAD checks every
bolted joint it draws: it measures what each bolt passes through and works out
whether the bolt is long enough. Two joints were still unchecked, the idler
wheels' axles and the axle of the take-up spring's spool. This run drew both.

**The idler axle was the wrong kind.** The parts list said to press a 608
bearing into a 22 mm hole in each 5 mm idler bracket and run the wheel on an
M8 x 60 through it. To measure that bolt, the bearing has to be drawn, and once
it was the problem was plain. The bolt and the wheel turned together inside that
one bearing. A 608 is 7 mm wide, so only 5 mm of it sat in the plate, and the
wheel's centre was 25.5 mm out from the bearing's. So one small ball bearing was
carrying the wheel's load as a twisting moment. The made parts alone weigh
45.6 kg, about 110 N per wheel, which comes to roughly 2.8 N m on that bearing.
A single deep-groove bearing resists a moment only by tilting through its
internal play, so the wheel would wobble. The press fit was the only thing
holding the bearing in the plate.

**Now the axle is fixed.** An M8 bolt goes out through an 8.4 mm hole from the
bracket's inside face. Then come a steel 8 x 12 x 2 mm spacer, the wheel and a
second spacer, with a nyloc outside. The wheel is the kind with two 608s and a
spacer tube in its hub, as a scooter wheel has. The nyloc clamps the bearings'
inner races and the tube to the bracket, so the bolt stays still and the
wheel's two bearings, 40 mm apart, take the load. The spacers are 12 mm across,
so they touch only the inner races.

**The length check.** The stack is bracket 5 + spacer 2 + hub 40 + spacer 2 =
49 mm. A nyloc and two threads need 10.5 mm past that. An M8 x 60 would leave
11 mm, only 0.5 mm to spare, so a hub 1 mm longer than drawn would fail it. The
parts list now says M8 x 65. The 13 mm spanner fits all the way round the nut
and through 225 degrees at the head, under the rail.

**The spool axle needed a fix in the checker.** The take-up spring's spool turns
on an M4 x 40 through both cheeks of a printed bracket. The checker follows a
through-bolt to the last part it clamps, but it stopped at the *first* piece of
that part, and both cheeks belong to one print. So it measured one cheek and
stopped there. A new flag runs the check to the last piece. The axle reads
29.7 mm (cheek, spool, cheek, 1 mm of float) with 10.3 mm left for the nyloc,
where 6.4 is needed, matching the bracket's own rule. None of the other 35
joints changed when the flag went in. 37 are measured now.

**Not known yet.** The wheel's hub is assumed to be 40 mm long, the same as its
tread, with a spacer tube between the bearings. If yours has no tube, tightening
the nyloc squeezes the inner races together through the balls, so snug it just
until the wheel spins free. Nobody has built one.

The CAD, the assembly guide and the manufacturing package are in
`ventures/open-tennis-robots/cad/`; this change is described in its README under
"Idler axles fixed, and the spool axle".
