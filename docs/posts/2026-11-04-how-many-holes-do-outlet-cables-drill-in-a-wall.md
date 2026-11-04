---
title: How many studs does the outlet wiring drill through?
date: 2026-11-04
---

The wall-framing takeoff now counts the studs a cable run bores between
neighbouring receptacle boxes (`--electrical`, field `cableHoles`). It counts
each full-height stud, king or jack whose centre lies between two boxes, once
per wall face. Switch runs are not counted, since switch boxes have no
position yet. A 3/4 in hole sits inside the 2x4 bearing-wall bore limit, and
`--drilling` checks any other size.

Checked by a hand-built layout in `electrical.test.mjs`; no real house or
electrician's count has been compared. The count is an estimate for the walk-through.
