---
title: "Fuzzing the wall layout engine: 400 random houses, no failed self-check"
seo_title: "Fuzzing the wall layout engine"
date: 2026-11-01
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test throws random walls and openings at the framing engine and checks every layout with its own self-check.
---

The framing takeoff's sheathing code has had a property test for a while. The layout engine, which decides where every stud, king, jack, header and cripple goes, did not. `engine-fuzz.test.mjs` now draws 400 seeded random two-wall plans (lengths from 6 to 36 ft, 16 or 24 in spacing, 2x4 or 2x6 studs, up to several doors and windows per wall) and requires that each plan is either rejected by `validatePlan` or laid out with an empty `verifyWall` problem list and a successful `takeoff`.

Result: more than 200 of the 400 plans were valid, and none produced a problem. The first run did fail, but only because the test's openings had no labels and `verifyWall` finds a header by its opening's label. The test now labels them.

What this does not show: that a layout is structurally adequate (the engine never claims that), or that it matches a real builder's plan. It shows the layout self-check holds on a wide spread of inputs, which is the property the cut list and order depend on.
