---
title: "Ceiling drywall joints now land on joists in the wall framing takeoff"
date: 2026-10-26
description: "The drywall estimate can snap ceiling sheet ends to joists, not only wall sheet ends to studs."
tags: [wall-framing-takeoff, construction, drywall]
---

A butt joint on a ceiling that falls between joists has nothing to screw to. [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) already snapped wall joints to studs; the plan key `drywall.ceilingJoistSpacing` (12, 16, 19.2 or 24 in) now does the same for ceilings, with `jointsOnStuds: true` to turn snapping on.

Hand count: a 20 ft ceiling hung with 10 ft sheets and joists at 16 in puts its naive joint at 120 in, which is not a multiple of 16, so it misses a joist. Snapped, each course is cut at 112 and 224 in and the two leftover 16 in pieces share a sheet: 5 sheets instead of 4, with every joint on framing. The result reports joints, how many are off a joist, and how many a naive hang would leave off.

Unchecked: a real ceiling hang, and a page control (this is engine and CLI plan-file only). Estimates only, not engineering or building-code advice.
