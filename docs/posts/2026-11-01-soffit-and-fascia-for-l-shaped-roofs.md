---
title: "Soffit and fascia now count the cross wing on an L-shaped roof"
date: 2026-11-01
tags: [wall-framing-takeoff, construction]
description: The framing takeoff's soffit, fascia and J-channel count used to stop at the main roof; it now swaps in a cross wing's own eaves and rakes.
---

The wall-framing-takeoff tool counted soffit panels, fascia boards and J-channel for a plain gable or hip roof, and said plainly that a cross wing's overhangs were left out. On an L- or T-shaped house that is a real gap: the wing removes a stretch of main eave and adds two eaves and two rakes of its own.

For a wing of the same pitch as the main roof, the valley meets the main eave line a wing half-width plus the overhang either side of the wing's axis. So the wing replaces `width + 2 x overhang` of main eave. It adds two eave runs, each from the wing's gable end (plus its rake overhang) to that corner, and two rakes up the wing's gable end.

Worked by hand for a 40 x 28 ft roof with 12 in overhangs and a 12 ft wide wing reaching 16 ft out: eaves go from 84 ft to 102 ft. That figure is a test in `eaves.test.mjs`. A wing at a different pitch is noted in the output and not counted. Nothing here was checked against a real house plan yet.
