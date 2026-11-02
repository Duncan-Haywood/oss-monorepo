---
title: "Four hundred random houses against the siding count"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test now throws random walls, gables, openings and siding options at the siding engine and checks the board, wrap and corner arithmetic.
---

The siding count in wall-framing-takeoff stacks courses on each exterior wall, cuts them round openings and gables, and packs the runs into stock boards. Hand-worked tests cover cases we picked. A new seeded fuzz test covers the rest: 400 random sets of one to four walls, some gabled, with non-overlapping windows and doors, in lap or vertical style, with random battens, trim, starter strip, flashing and tape.

Each must be refused with a reason or hold these: every count finite and non-negative, boards that can physically hold the cut runs, house wrap rolls and corner boards that cover their area, no starter strip on vertical siding, and never fewer boards when waste goes up. All 400 hold. It found no bug. To check the test can fail, we made the wrap-roll count round down instead of up and it failed at once. It is still not compared with a real siding order.
