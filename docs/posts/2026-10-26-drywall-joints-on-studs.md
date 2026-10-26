---
title: "Where drywall sheets end: 18 joints off the studs in a sample house"
date: 2026-10-26
description: "Hung naively, a sample house's 8 ft drywall sheets end between studs 18 times. Snapping each cut to a stud costs 4 sheets and fixes all 18."
tags: [wall-framing-takeoff, drywall, construction]
---

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) counts drywall sheets for a framed house. A sheet's end joint should land on a stud, king or jack, not in the air between two. Until now the count ignored that. A new plan key, `drywall.jointsOnStuds`, cuts each sheet at the last framing centre it can reach.

On the sample house (a computed layout, not a real hang), counting end joints on walls:

| Sheet | Off framing, naive | Off framing, snapped | Sheets, naive → snapped |
|---|---|---|---|
| 8 ft | 18 | 0 | 71 → 75 |
| 10 ft | 29 | 0 | 56 → 58 |
| 12 ft | 4 | 0 | 47 → 46 |

Eight-foot sheets are a multiple of the 16 in stud spacing, so they only miss when a run starts after a door or window. Ten-foot sheets miss more, since 120 in is 7.5 spacings. Snapping shortens some pieces, which can cost sheets or, with 12 ft, save one by packing offcuts better.

Limits: walls only (ceiling joists are not in the plan), hand-count tests, no real hang to check against, engine and CLI but no page control yet.
