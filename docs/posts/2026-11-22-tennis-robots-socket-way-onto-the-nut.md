---
title: "Tennis robots: how a socket and ratchet get onto each nut, swept exactly in open CAD"
seo_title: "Tennis robots: a socket's way onto every nut, checked in CAD"
date: 2026-11-22
tags: [open-tennis-robots, cad, hardware]
description: "Open CAD for the tennis robots moves a socket and ratchet onto each nut from outside. Each nut a socket fits has a way on; the drum axle has 18 mm spare."
---

Earlier today the open tennis robots' CAD learned to put a deep socket and a
ratchet on every nut in both machines and swing the handle to see whether the
nut turns ([that post](2026-11-22-tennis-robots-deep-socket-on-the-nuts.md)).
It put the tool on the nut directly. It did not ask how a hand gets it there,
which matters most for the collector's drum axle nut: it sits inside a cage of
rods, and the tool that turns it has its ratchet head inside the cage.

The build now moves the tool in as a person would, in two straight moves
from wholly outside the machine as it stands when the step comes. The last
move is down the bolt's axis: the socket's mouth starts just past the bolt's
end and slides onto the nut with the ratchet and hand on it. Before that the
tool either comes straight down the axis, or slides in sideways along its
handle, head first, the hand trailing.

The tool is made of round pieces on the axis and boxes along the handle. So
the volume each move sweeps can be drawn exactly: a cylinder or box made
longer, or a cylinder drawn out sideways into a slot. Nothing is sampled, so a
3 mm rod cannot slip between two sampled positions.

What it found:

- **Every nut a socket fits on has a straight way on, at every hole.** That is
  14 of the 15 nut joints; the 15th, the lift flight caps' M3 nut, takes no
  socket at all and the guide holds it with a spanner.
- **The drum axle nut is reached sideways.** The drum's cover and hatch close
  its ends, so the axle's line is blocked. The ratchet's 34 mm head goes in
  between two of the cage's rods instead. Heads up to 52 mm pass; a 54 mm one
  does not. The tighter limit is still the swing on the nut: a ratchet with a
  44 mm head has a 26 mm handle, which leaves only 5 degrees of swing between
  the rods, short of the 15 a 72-tooth ratchet needs.
- Seven nuts take the axis, seven go in sideways. The guide's table
  (`guide/ASSEMBLY.md`, "A deep socket on an extension") now has a "Way on"
  column.

What it does not do: curved paths (a "none" would mean no straight way, not no
way at all), the bolt's tail (it is not drawn, and is taken to go up the
socket's bore), and a hand that is anything but a box. The tool sizes are
typical of a 1/4" drive set, assumed. Nobody has built either robot yet. The
method is in `ventures/open-tennis-robots/cad/README.md`, "The socket's way
onto the nut".
