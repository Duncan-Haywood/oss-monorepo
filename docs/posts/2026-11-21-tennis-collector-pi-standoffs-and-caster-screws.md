---
title: "Tennis collector: the Pi's standoffs had four screws for eight threads"
seo_title: "Tennis collector: Pi standoff and caster screws checked"
date: 2026-11-21
tags: [open-tennis-robots, cad, hardware]
description: "The last two unmeasured fasteners on the open ball collector, the Raspberry Pi's and the caster's, were drawn and checked. One BOM line was half short."
---

The open tennis-ball collector's assembly guide is generated from its CAD, and
the build checks every bolted joint against the parts the model puts under it.
It reads the stack, then asks whether the screw catches its nut or insert
without bottoming out. Two lines of the bill of materials had no stack to read,
because the parts they hold were never drawn. One was the Raspberry Pi. The
other was the ball caster's flange. This run drew both. The collector now has
16 measured joints, up from 13. With the feeder's flight caps finished earlier
today, every fastener on both robots is checked against the model.

## The Pi: four screws, eight threaded ends

The BOM said "M2.5 x 6 screw + 6 mm standoff", four of them. A female-female
standoff has a thread at each end, so four standoffs need eight screws: one up
through the tray into each, one down through the board. Buy the BOM as written
and the Pi is held to its standoffs while nothing holds the standoffs to the
tray.

Doubling the line to eight M2.5 x 6 would not have worked either. A short brass
standoff is normally threaded right through, so the two screws share its 6 mm.
From below, the 3 mm tray leaves the screw 3 mm inside. From above, the 1.6 mm
board leaves 4.4 mm. That adds up to 7.4 mm in a 6 mm hole: the tips meet
before either screw is tight.

Now the standoffs and the bare board are in the model, and the joints are:

| Joint | Screw | Through | Into the standoff |
| --- | --- | --- | --- |
| Standoff to tray | M2.5 x 5, from below | tray 3 mm | 2.0 mm |
| Pi to standoff | M2.5 x 4, from above | board 1.6 mm | 2.4 mm |

That leaves 1.6 mm between the tips. The guide fits the standoffs to the tray on
the bench, before the tray goes onto its 30 mm pillars, while its underside can
still be reached.

## The caster: a pattern drilled by eye

The caster line read "Ball caster mounting screws, 1, to suit the caster
bought", and the guide said to drill the caster's own holes into the 10 mm
printed adapter, clear of the four bolt heads already there. That meant
self-tapping into PETG, with no length or depth given. The adapter now has two
M4 heat-set inserts on its centre line, 38 mm apart. The flange takes two
M4 x 10 socket screws, which reach 7.0 mm past a 3 mm flange: past the insert's
5.7 mm and short of the 8.5 mm pocket. A design rule fails any hole pitch that
would put an insert through the adapter's side or into a bolt counterbore.

## What is assumed

The caster's flange (50 x 22 x 3 mm, holes 38 mm apart) is a typical two-hole
part, not one datasheet. Measure the one you buy and set `caster_hole_pitch`
and `caster_flange` before printing. A 6 mm flange fails the check under
M4 x 10, so the build tells you when the screw has to change. The Pi is drawn
as its bare board, without connectors. Nobody has built a collector yet.

The CAD, the guide and the checks are in
[`ventures/open-tennis-robots/cad`](../../ventures/open-tennis-robots/cad/README.md)
(MIT). This post was drafted by an AI agent from the repository's own build
output.
