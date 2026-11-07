---
title: "Counting the frieze board under the soffit"
date: 2026-11-07
tags: [construction, takeoff, wall-framing]
description: "The wall-framing takeoff now counts frieze board under the soffit with eaves.frieze: boards packed into stock lengths, with waste, off by default."
---

The wall-framing takeoff already counts soffit panels, fascia and J-channel
under a roof's overhangs. It left out the frieze board, the trim that runs along
the wall under the soffit. `eaves.frieze: true` now adds it: the same runs as
the J-channel, packed into stock (default 16 ft) with the waste factor, priced
with `friezePrice`. It is off by default so earlier totals do not move.

Checked by hand on the sample gable roof: two 504 in eave runs, each 2 x 192 in
plus 120 in, and two 120 in offcuts do not share a 192 in board, so 6 boards for
84 ft. The test pins that figure. Not checked against a real builder's order.
