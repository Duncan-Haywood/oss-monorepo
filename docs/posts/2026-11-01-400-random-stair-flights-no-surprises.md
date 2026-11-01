---
title: "We threw 400 random stair flights at the framing takeoff's stair engine"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, testing, construction]
description: A seeded property test lays out 400 random stair flights and checks the riser, tread, stringer and mark arithmetic each time. It found nothing wrong.
---

Stairs are where a takeoff error turns into a trip hazard, so the stair engine in the wall-framing takeoff now has the same seeded fuzz test the wall, floor, roof, deck and sheathing engines already had.

`stairs-fuzz.test.mjs` draws 400 flights from a fixed seed: total rise 8 to 167 in, 30 to 129 in wide, 2x10 or 2x12 stringers at 12 to 36 in spacing, 1 in or 1-1/2 in treads, solid or open risers, optional rails, and an optional stock list. Each flight must either be refused with a reason or satisfy every check below.

- Risers are equal, at most 7-3/4 in, and add up to the rise.
- Treads are at least 10 in; the run is tread times treads; there is one mark per riser and the marks add up to the rise less one tread thickness.
- At least three stringers, no farther apart than asked, none shorter than its pitch line, and a bought board long enough when a stock list is given.
- Tread boards cover tread plus nosing.

All 400 pass, and the test asserts that both laid-out and refused flights occur, so the generator keeps hitting the limits. No bug found this time; the value is that a later change to the stair maths now fails loudly. Hand-checked arithmetic, not a code-official review.
