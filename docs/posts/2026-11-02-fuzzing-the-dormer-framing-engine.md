---
title: "Fuzzing the dormer framing engine found a zero-inch board in the cut list"
seo_title: "Fuzz testing a dormer framing takeoff: a zero-length cripple"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: 400 random dormers through the framing engine turned up a cut-list line with a length of 0 inches, caused by checking a length before rounding it.
---

The wall-framing takeoff turns a few typed dimensions into a cut list. Its dormer engines (gable and shed) had hand-checked tests for one sample dormer, but nobody had tried odd ones.

A seeded fuzz test now throws 400 random dormers at them: widths, eave heights, pitches, spacings, windows and main-roof openings, many of them nonsense. Each must be refused with a reason, or produce parts that all have a positive count and length, a cheek run and ridge that match the closed-form geometry, rafters and jacks in pairs, and a report that prints.

Seed 93 failed. A window left a "cripple over header" a hair under 1/32 inch long. The engine checked `length > 0`, then rounded to the nearest 1/16 inch, so the cut list showed five boards of 0 inches. The fix is one line: check the rounded length. No real dormer has this, but a builder reading a cut list should never see a zero-inch board.

The test uses invented dormers only; it checks internal consistency, not a real plan. Real permitted dormer plans are still on the roadmap's wanted list.
