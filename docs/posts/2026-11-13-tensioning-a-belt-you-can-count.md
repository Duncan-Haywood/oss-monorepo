---
title: "Tensioning a 2.4 m ball-lift belt: 7.5 mm of travel, and a tension you can count by hand"
seo_title: "Timing belt tensioner for a cleated ball elevator: travel, pluck test"
date: 2026-11-13
tags: [ventures, open-tennis-robots, cad]
description: "The top pulley tensioner for an open tennis-ball lift: where 7.5 mm of travel comes from, why 10.5 N, how to set it by counting swings, and a flight fix."
---

The open tennis-ball feeder got a ball lift this morning. A cleated timing belt
carries balls from a sump at court level 2.36 m up into the hopper. The CAD
for its top pulley said "slot the holes to tension the belt" and nothing else.
This afternoon's work turns that into a mechanism, with numbers a builder can
check.

**How much travel, and where it comes from.** The belt is 959 AT5 teeth welded
endless: 4,795 mm. Whole teeth don't land exactly on the designed centre
distance, so the belt sits 0.65 mm long before anything else. A welder's
tolerance of ±2 mm on length (assumed; ask yours) moves the centre by ±1 mm.
Tension stretches the steel-cord belt 0.92 mm, which adds 0.46 mm. To put the
belt on, the head has to come down past the teeth, so it goes 5 mm below the
shortest belt's free length. Added up, the head travels 7.5 mm on the spine:
from 5.3 mm below its drawn position to 2.2 mm above.

That travel cost two other changes. The spine is now 5.3 mm shorter, so the
lowered pulley's teeth stay 3 mm clear of it. The rod sockets in the head are
6.3 mm deeper, so the channel's rods stay seated.

**How tight.** The bottom pulley drives, so the down strand is the slack one at
the motor. A 16-tooth pulley has only 8 teeth in mesh, and a slack strand there
is how teeth jump. With every flight loaded, the lift pulls 10.5 N. Setting the
static tension equal to that pull leaves 5.3 N in the slack strand and 15.8 N
in the tight one. Each 2.4 m strand also hangs about 2 N of its own weight from
the top pulley. The two jack screws holding the head up carry 28 N in all,
which is small for a printed M5 nut pocket.

**The mechanism is mostly parts already there.** The head's four side bolts go
into T-nuts in the spine's slots. A loose T-nut slides with the head, so the
head needs plain holes, not slots. Two M5 jack screws turn in nuts captive in
the head's walls, and their hex heads stand on the top rod clip, which moved
down to sit under the head's lowest position. Turn them out to raise the
head, tighten the side bolts, then lock each screw with a jam nut.

**Setting it without a gauge.** A strand of length L, mass m per metre and
tension T swings at f = √(T/m) / 2L. For this belt that is about 2.4 swings a
second: pluck the down strand at mid-height and count against a phone's
stopwatch. Or push it sideways with 1 N (a 100 g weight over a pulley, or a
luggage scale) and it should move about 56 mm. Both figures rest on an assumed
0.085 kg per metre, so weigh a metre of your belt and redo the sum.

**A fixing that did not fit.** The morning's spec fixed each flight with "two
M3 through the belt between its cords". Checking it against the belt's
profile, it doesn't work. A screw through a timing belt puts its head on the
tooth side, which runs over the pulleys' teeth and the spine's sliding strip.
An M3 countersunk head is 6 mm across, and an AT5 tooth is about 2.5 mm, so
there is nowhere for the head to go. The bill of materials now asks for PU
cleats welded to the back by the belt supplier, the usual way cleated belts are
made. A printed finger cap that fits over a welded cleat is the next CAD job.

The tests move the head and pulley to both ends of the travel. At each end they
check the head clears the spine, the clip and the rods, the rods stay over
10 mm deep in their sockets, the side bolts' T-nuts stay on the spine, and the
head never lands on the jack screws. Every figure about the belt is still an
assumption until somebody builds one. The full section is "Top pulley
tensioner" in
[`ventures/open-tennis-robots/cad/README.md`](../../ventures/open-tennis-robots/cad/README.md).
