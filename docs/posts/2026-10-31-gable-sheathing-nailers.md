---
title: "A gable wall with a wide window no longer stops the sheathing plan"
date: 2026-10-31
description: "The free wall-framing takeoff used to give up on gable end walls when a panel joint fell over a wide opening. It now notes the nailer to fit, with its length."
tags: [construction, framing, tools]
---

# A gable wall with a wide window no longer stops the sheathing plan

Sheathing panels are 48 in wide, and each vertical joint has to land on framing.
On a wall with a wide window, the nearest stud can be further away than a sheet.
The straight-wall planner already handled that: it put the joint over the opening
and called for a short nailer between the header and the top plate.

Gable end walls did not. They were laid out as if no opening could ever
swallow a joint, so a wide window near the end of a gable wall came back as
"no stud within 48 in of a panel edge; sheathe it by hand".

The gable planner now looks at the openings too. It places the joint over the
opening, adds a note ("fit a 2x4 nailer about 24 in long on end between the header
and the sloped top plate"), and the wall's self-check accepts that edge.
The length runs from the top of the header to the underside of the sloped plate at
the joint.

The nailer is a note, not a line in the lumber order. The test is a 20 ft gable end with
a 10 ft window; it fails without the change. There is no real gable plan behind
it yet, so treat the length as a starting point and check it on the wall.

The tool is the [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/); it is a
planning aid, and the engineer or inspector decides the framing.
