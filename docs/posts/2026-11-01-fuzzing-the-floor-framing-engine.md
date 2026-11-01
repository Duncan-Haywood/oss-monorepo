---
title: "300 random floors thrown at the floor framing engine"
date: 2026-11-01
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test now feeds 300 random floors to the framing takeoff's floor engine and checks board lengths, rim coverage and sheet counts.
---

The wall engine already had a seeded fuzz test. The floor engine, which lays joists, rims and subfloor, only had hand-counted cases. `floor-fuzz.test.mjs` closes that gap with 300 seeded random floors (2 to 62 ft wide, joists 2x8 or 2x10, spacing 12 to 24 in, with and without a beam or rim).

Each floor must either be refused with a stated reason, or lay out so that no joist is longer than the longest board in stock, the front and back rims add up to the floor width, sheets are bought, and the cut list is not empty. A throw counts as a failure.

All 300 pass today, which is a result in itself: the invariants hold. These are invariants only, not a check against a real floor plan, so a real permitted plan is still the next thing the engine needs.
