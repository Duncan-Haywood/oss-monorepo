---
title: "From a generated house plan to a stud count, with no typing"
date: 2026-10-27
description: "The wall framing takeoff now reads the DXF that Open House Plans writes, and every door and window it finds matches the plan's own schedule."
tags: [wall-framing-takeoff, open-house-plans, construction, dxf]
---

The first DXF importer was only tested on files we typed ourselves. The first real files we had were the ones a sister tool, [Open House Plans](../../ventures/open-house-plans/), writes: and the importer failed on them, listing dozens of phantom walls and king-stud errors. The cause: that DXF draws every piece of wall between openings as a small closed rectangle, with the doors and windows as gaps.

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) now reads rectangles as centre lines, trims corners to centre to centre, and treats a gap with a door, window or garage-door line in it as an opening of that width. On four generated houses it finds each 4-wall exterior loop, and the opening counts and widths match the generator's own schedule (18 of 18, 30 of 30, 33 of 33, 24 of 24).

It also shows honestly what the framing engine cannot yet do with a real plan: two windows a mullion apart overlap their king studs, and a door 4 in from a wall end needs hand framing. Those are the next fixes. The files are still machine-drawn, not an architect's; one of those is the next test. Estimates only, not engineering or building-code advice.
