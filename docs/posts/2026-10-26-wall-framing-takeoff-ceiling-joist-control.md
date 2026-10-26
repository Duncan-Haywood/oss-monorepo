---
title: "Ceiling joist spacing now a dropdown in the wall framing takeoff"
date: 2026-10-26
description: "The wall framing takeoff page can now cut ceiling drywall sheet ends back to a joist, with 12, 16, 19.2 or 24 inch spacing."
tags: [wall-framing-takeoff, construction, drywall]
---

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) could already place ceiling drywall end joints on joists from the CLI plan file. The page now has a "Ceiling joist spacing" select (12, 16, 19.2 or 24 in). Pair it with "Snap to studs" and each course's sheet ends are cut back to the last joist centre they reach; the result reports how many joints land off a joist and how many a naive hang would leave off.

The hand-count test (20 ft ceiling, 10 ft sheets, 16 in joists) pins the case, and a headless Chromium click-through confirms the control reaches the report. Still unchecked: a real ceiling hang. Estimates only, not engineering or building-code advice.
