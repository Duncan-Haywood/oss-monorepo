---
title: "Dropped soffits can now be typed into the wall framing takeoff page"
date: 2026-10-27
description: "The drywall ceiling box on the wall framing takeoff page takes a soffit as 'length x drop' and counts its board, bead and taped angle."
tags: [wall-framing-takeoff, construction, drywall]
---

The drywall engine in [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) could already count a dropped soffit or tray edge on a ceiling, but only from a plan file. The page's ceiling box now takes it directly: after a ceiling's width and depth, add `12 ft x 12 in` (length x drop) for each step, for example `40 ft, 28 ft, 12 ft x 12 in`. Saved plans restore the steps into the same box, and a step written without a drop says what is wrong.

Checked in a real Chromium on the sample house: one 12 ft by 12 in step took the count from 106 to 108 sheets and the corner bead from 238 to 250 ft, with no page errors. Still unchecked against a real soffit; the numbers are an estimate from typed sizes, not construction advice.
