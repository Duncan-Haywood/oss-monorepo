---
title: "A stair order forgot the hardware that holds the stringers up"
date: 2026-10-30
tags: [wall-framing-takeoff, stairs]
description: "The stair takeoff bought stringers, treads and rails but never listed what attaches the stringers; it now counts one top connector and one foot anchor per stringer."
---

The [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) laid out stairs down to the notch geometry, the tread boards and the guard posts, but its output never mentioned how a stringer gets fastened at either end. A framer reading the order would find lumber and no hanger.

It now adds a `hardware` block: one top connector (a hanger or a bolted ledger connection) and one foot anchor for every stringer. Hand check: a 36 in wide stair at 16 in spacing needs `ceil(34.5 / 16) + 1 = 4` stringers, so 4 and 4; a 60 in stair needs `ceil(58.5 / 16) + 1 = 5`.

This is a count, not a design. Connector size, fasteners and the load path are the engineer's or the manufacturer's call, and the output says so. Nothing here was checked against a permitted stair plan; a real one is still wanted.
