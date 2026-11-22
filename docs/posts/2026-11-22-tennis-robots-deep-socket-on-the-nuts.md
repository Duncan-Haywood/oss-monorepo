---
title: "Tennis robots: a deep socket and ratchet reach the drum axle nut a spanner can only hold"
seo_title: "Tennis robots: deep sockets on every nut, checked in open CAD"
date: 2026-11-22
tags: [open-tennis-robots, cad, hardware]
description: "The open tennis robots' CAD now tries a deep socket on an extension at every nut. It turns the drum axle nut a spanner can only hold, with 15 degrees to spare."
---

The open tennis robots' CAD already lays a ring spanner and a hand on every
nut in both machines, turning them round the bolt to see whether the nut can be
held and turned when its assembly step comes. The check was 2026-11-21's work.
It left one tool out: a deep socket on an extension, which goes on along the
bolt instead of lying flat beside it.

The build now tries that too. For each of the 15 nut joints (3 on the
collector, 12 on the feeder), at every hole, it puts a deep socket on the nut
and tries the bars of a set in turn, from none to 250 mm. On the shortest bar
whose socket and bar miss the work, it swings a ratchet and a hand round the
bolt 5 degrees at a time. It also checks that the bolt's tail past the nut fits
up inside the socket. The sizes are typical of a 1/4" drive set (3/8" for the
13 mm nut), not a standard's figures, and the guide says so. A ratchet is
taken to turn a nut with 15 degrees of handle swing.

Three findings:

- **The drum axle nut turns.** It sits inside the collector's drum on the
  axle, inside a cage of rods. A 200 mm spanner fits between two rods, but
  only over 15 degrees at the worst hole, short of the 30 a 12-point ring needs
  to take a new grip. So the guide holds that nut and turns the bolt's head
  outside the arm. A 63 mm deep socket with the ratchet straight on it puts the
  ratchet's head inside the cage and its narrower handle out through one gap.
  That gives exactly 15 degrees, which a ratchet needs, in each of the 18
  gaps. The hand is outside the cage; the rods stop the handle itself. It is
  marginal: a ratchet with a 30 mm handle instead of a 20 mm one does not
  fit, and the window is sampled every 5 degrees. The guide still turns the
  head.
- **The lift flight caps' M3 nut takes no socket.** No bar up to 250 mm clears
  the work. The spanner holds it, which is all the step asks.
- **The levelling feet's jam nuts need a deep socket.** 26.8 mm of stud stands
  past the nut. A shallow socket's bore is under 10 mm deep.

No nut needed an extension bar. Wherever a socket goes on at all, the ratchet
goes straight on it.

What the check does not do: it does not try getting the socket to the nut,
for example feeding the ratchet in between two rods and then sliding the
socket along the axle. The hand is a box, and the tool sizes are assumed.
Nobody has built either robot yet. The table is in each machine's generated
`guide/ASSEMBLY.md` ("A deep socket on an extension"), and the method and
sizes are in `ventures/open-tennis-robots/cad/README.md`.
