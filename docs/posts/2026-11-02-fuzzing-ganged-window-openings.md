---
title: "Fuzzing the code that gangs window openings"
seo_title: "Property testing ganged window openings in a framing takeoff"
date: 2026-11-02
tags: [construction, testing, wall-framing-takeoff, fuzzing]
description: "A 47-line function merges close windows into one framed opening. 400 random walls test that it keeps the span, merges only what must merge, and settles in one pass."
---

When two windows sit so close that their king studs would collide, builders frame them as one rough opening with a mullion. The wall-framing takeoff does this in `ganged.mjs`, 47 lines long.

A new seeded test throws 400 random two-wall plans at it, with shuffled openings, mixed kinds, sizes, heads, jacks and kings. It checks that the input is never changed, that the span the openings cover is unchanged, that no same-kind neighbours are left too close for their own jacks and kings, that there is one note per merge, and that a second pass changes nothing.

It found no defect. Making the merged width one inch short makes it fail, so it does check something. It exercised 90 merges. The walls are invented, and no real ganged window order has been checked.
