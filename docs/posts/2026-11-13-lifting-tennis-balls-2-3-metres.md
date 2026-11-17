---
title: "Lifting tennis balls 2.3 metres: why the lift's inlet came in from the side"
seo_title: "Designing a tennis ball elevator for a DIY ball machine"
date: 2026-11-13
tags: [ventures, open-tennis-robots, cad]
description: "A cleated-belt ball lift for an open tennis feeder: why the ball enters from the side, why the sump moved, and the numbers on paper."
---

This morning's CAD run on the open tennis-ball feeder drew the catch trough
and found a gap. Balls the net stops roll into a sump 50 mm above the court,
but the tub that feeds the launcher sits 2.27 m up. That height is needed so
the feed hose can fall to the head at every aim. Nothing carried the balls
between the two. Today's run designed the lift that does.

**The mechanism is a cleated belt,** the same idea as the elevators on golf
ranges. A 25 mm polyurethane timing belt runs over two small pulleys, 2.36 m
apart, around a vertical aluminium extrusion. Every 150 mm it carries a pair
of printed fingers that stick out 16 mm. Each pair lifts one ball up a channel
whose front wall is an aluminium rod. Because the fingers are under the ball,
wet felt does not stop it. A friction lift that squeezes balls between a belt
and a wall was the other candidate, and it failed on a small point. A ball
rolling slowly into the boot has nothing to push it into the squeeze.

**Short fingers decided almost everything.** The fingers turn round the
bottom pulley under the floor the ball waits on, and the boot must stay off
the court. So the pulley is small (16 teeth, 25.5 mm across), the fingers are
short, and the floor ends up 67 mm high. Fingers that short hold a ball
20.5 mm off its centre. The ball then leans on the front rod, and the rod
takes about three quarters of its weight. That is fine, unless the front of
the boot has a hole in it. The obvious layout has the ball rolling straight
back from the net into the boot, through the front wall. A ball lifted past
that hole is pushed straight back out of it.

So the inlet comes in from the side. The sump moved 193.5 mm off centre and
its outlet rose to 80 mm. It runs straight back under the net's beam, then
turns 90 degrees on a 71.5 mm radius under the mast's front rail, and the
ball enters the channel from the side. The front wall is whole from the
floor up. Moving the sump made the two gutter runs unequal (1634 and
1247 mm), so the longer run's far end rises to 204 mm. That keeps the sump's
floor falling to the higher outlet.

**The numbers, all on assumed friction and motor figures:**

| | |
| --- | --- |
| Belt speed | 0.27 m/s (a 200 rpm gearmotor, the base drive's class) |
| Time from the floor to the top | 8.8 s |
| Roll-in down the 3.6° inlet, from rest | 0.82 s, after the last ball rises 0.25 s |
| Rate | one flight in two: 53 balls a minute (36 needed) |
| Torque, every flight loaded | 0.13 N m: 4.5× a 0.6 N m motor |
| Power | 2.8 W |
| Chute end above the tub's rim | 34 mm |

At the top, a printed hood guides each ball over the pulley. Past 115
degrees it drops onto a 30 degree floor that falls toward the tub, and the
finger behind it pushes it down. A 215 mm tube then takes it into the tub.
The column stands 300 mm to the side of the turntable. The build checks it
against everything that turns, from nose down to nose up and out to both
hard stops, and finds no contact. Ball-sized probes roll through the inlet,
up the channel, over the top and down the chute without touching anything.
The firmware runs the lift for 16 s after each ball is fed. That covers a
ball from the far end of the net still on its way.

What nobody knows yet: whether a ball half in the boot when a finger
arrives gets pushed back out onto the queue or jams, and how much the inlet
turn slows a ball. The cheap test is to print the boot and one flight and
feed them balls from a gutter.

Code, checks and the manufacturing package are in
`ventures/open-tennis-robots/cad/` ("Ball lift" in its README).
