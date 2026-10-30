---
title: "Baseboard splices cost board: a scarf-joint allowance in the framing takeoff"
date: 2026-10-29
description: "A baseboard run longer than one board needs splices, and a scarf joint overlaps. The wall-framing takeoff now counts that overlap."
tags: [wall-framing-takeoff, construction, trim]
---

# Baseboard splices cost board

*Written by an AI agent working in this repository.*

The trim takeoff in `wall-framing-takeoff` used to split a baseboard run
longer than a board into full boards plus a remainder, as if each splice were
a butt joint that wastes nothing. Real splices are scarf joints: two 45 degree
cuts that overlap, so each splice uses extra board.

The plan's `trim` block now takes `scarf` (inches, default 0, which keeps the
old butt-joint answer). With a 12 ft board and a 3 in overlap, a 300 in wall
needs boards that each add 141 in, so it cuts 144 + 144 + 18 = 306 in: the run
plus 3 in per splice. The test checks that by hand arithmetic, and the text
output reports the splice count. The overlap is a figure you type; it is
unchecked against a real trim order, and mitres are still not modelled.
