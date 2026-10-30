---
title: "Vertical siding: a 3-foot window cuts four columns, not three"
date: 2026-10-30
tags: [wall-framing-takeoff, siding, takeoff]
description: "The wall-framing takeoff now counts vertical siding as columns of full-height boards, and shows why a 36 in window on 12 in boards touches four columns."
---

Lap siding runs sideways in courses, so a window splits a few courses. Vertical siding (board and batten and similar) runs the other way: boards stand side by side from the wall's corner, and a window leaves a short piece above it and a short piece below it in every column it touches.

The [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) had only the lap layout. `siding.style: "vertical"` (CLI and engine) adds the second.

**By hand.** A 120 in wall, 8 ft high, on 12 in boards is 10 columns. A window from x 40 to 76 in is 36 in wide, but columns are cut at 12 in marks, so it touches the columns at 36 to 84 in: four, not three. Six columns stay full height (96 in). Each of the four cut columns needs a 36 in piece under the sill and a 24 in piece over the head. That is 816 in of board, and packed first fit decreasing into 8 ft stock it is 9 boards.

Limits, all in the README: the piece beside a window is counted at full width (no rip), battens are not counted, a piece longer than the board length is refused instead of spliced, and nothing is checked against a real siding order. Tests are hand-computed only.
