---
title: "Counting the trim boards around every window and door"
date: 2026-10-30
tags: [wall-framing-takeoff, siding, estimating]
description: "The framing takeoff's siding step now orders exterior window and door trim as cut pieces packed into boards, with a hand-worked example."
---

Exterior trim is the line item that gets guessed. The [wall framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) already cuts siding course by course and packs the runs into boards. Until now it left the trim around openings out of the order. It no longer does, if you ask it to (`siding.openingTrim: true`).

Per door it cuts a head and two jambs. Per window it cuts a head, a sill and two jambs. Heads and sills run the opening width plus a trim width on each side, 3.5 in by default for a 1x4. The pieces are packed into 8 ft boards by first fit decreasing, as the corner boards are.

A worked case: a 36 x 36 in window and a 36 x 80 in door. The pieces are 80, 80, 43, 43, 43, 36 and 36 in, 361 in in all. They pack into five 8 ft boards: one for each 80 in jamb, 43 + 43, 43 + 36, and a last 36. That is the test in `siding.test.mjs`.

What it does not do: shorten the siding runs by the trim, miter anything, or compare against a real trim order. The only check is the hand count above, and a real builder's trim takeoff on a permitted plan would be the next honest test.
