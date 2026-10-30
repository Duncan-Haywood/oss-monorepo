---
title: "Winder stairs: a tread that passes by arc can fail by straight edge"
date: 2026-10-30
tags: [wall-framing-takeoff, stairs, geometry]
description: "Three 30-degree winders at the smallest radius that passes the 6 in rule measured along the arc come up short when you measure with a tape across the wedge."
---

A winder is a wedge-shaped stair tread that turns a corner without a landing. The model stair code asks for a minimum depth at the narrow end (6 in) and 10 in of depth 12 in out from the narrow side. The [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) already solved the smallest inner radius that meets those depths, but it measured depth along the arc: radius times angle.

Nobody builds an arc. The tread has a straight edge, and a tape held across a wedge reads `2 x radius x sin(angle / 2)`, which is always a little less than `radius x angle`.

**The numbers.** Three 30-degree treads need an inner radius of 11.5 in to reach 6 in at the narrow end by arc. By straight edge, 11.5 in gives 5.95 in. At a 13 in radius the arc says 6.81 in and the straight edge 6.73 in, so that one passes both ways.

**What changed.** `layoutWinders` now reports, for each tread, its four corners, its area (a shoelace sum, 558 sq in each at 13 in radius and a 36 in stair) and the rectangle of board it is cut from. It also reports the straight-edge depths and says when a stair passes by arc and fails by straight edge. The CLI prints all of it under `--stairs`.

**Limits.** This is geometry checked by hand-computed tests. The code edition is yours to confirm, and the tool does not frame under the treads. No real winder stair was built from it.
