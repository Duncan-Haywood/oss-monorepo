---
title: "Can a stair guard post take 200 pounds at the top rail?"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, construction]
description: The framing takeoff's stair module now checks the guard post's own bending under a typed 200 lb load at guard height, and says plainly that the bolted attachment is not checked.
---

After the stringer and the tread, the stair part people actually lean on is the guard post. The model residential code asks a guard to resist a concentrated load at the top in any direction, and `postCheck: {point, Fb}` on a stair now runs that sum for the posts the rail layout already counted.

The post is a cantilever fixed at its attachment: M = P x h, taken about the weaker axis, stress M / S against an allowable bending stress you type (none is shipped).

Hand arithmetic, as in the tests: a 3.5 x 3.5 in post with 200 lb at 36 in gives 1,008 psi, which passes a typed 1,200 psi. The same load on a 1.5 x 3.5 in member loaded on its weak face gives 5,486 psi and fails.

The honest limit: in a real stair the bolted or notched connection to the stringer or rim almost always governs before the post itself does. The report prints that this is not checked. It is a first pass for a framer, not an engineer's stamp, and is verified against hand sums only, not a load test.
