---
title: "Which board a stair stringer is cut from"
date: 2026-10-30
tags: [wall-framing-takeoff, stairs]
description: "The stair takeoff gave the stringer length but not the board to buy; it now names the shortest listed stock board that holds one."
---

The stair takeoff computed each stringer's length (pitch line plus the plumb and level cuts) and refused a stair no listed board could hold, but it never said which board to buy. It now adds `stringerStock`: the shortest listed board of the stringer's size that is at least as long as one stringer, the count (one per stringer) and the spare length on each.

Hand check: a 108 in rise at a 10 in tread needs a stringer well under 192 in, so the 16 ft 2x12 is the pick; the test recomputes the minimum over the stock list and compares. With no plan there is no stock list, so the field is null.

This is one board per stringer, not nested cutting stock; the stringers still join the whole-order cutting-stock pass. Nothing here was checked against a real stair order.
