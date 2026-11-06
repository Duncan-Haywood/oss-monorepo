---
title: "Counting the plastic-cap nails under the shingles"
date: 2026-11-06
description: "wall-framing-takeoff now counts underlayment cap nails from a typed per-square rate, with boxes and a budget line."
tags: [construction, roofing, takeoff]
---

Roofing takeoffs usually count shingle nails and forget the fasteners that hold the underlayment down. `wall-framing-takeoff` now counts them when you ask: set `roofing.capNailsPerSquare` to the rate on your underlayment maker's schedule and the roof layout multiplies it by the squares and the roofing waste factor, rounds up, and reports boxes (2,000 per box unless you type `roofing.capNailBox`). The budget gets a line priced by `capNailBox`.

The rate is never assumed. It is a typed number, and the note on the result says so. Checked by hand arithmetic in `roof.test.mjs`, including the off, negative and box-size cases; no real roof plan was used.
