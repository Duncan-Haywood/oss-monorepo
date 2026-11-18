---
title: "Fuzzing a DXF reader found doors hanging past the end of the wall"
seo_title: "Fuzz testing a DXF floor plan importer: a door that overhung its wall"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, dxf, construction]
description: "A seeded fuzz test on the wall-framing DXF importer found openings placed beyond the end of their wall, and the fix that trims them."
---

The wall-framing takeoff reads an architect's DXF drawing and turns lines on wall, door and window layers into a plan. It had hand-written tests but no randomised ones, unlike the rest of the engines.

A seeded fuzz test now draws 300 random houses: random units, stray lines on door, window and note layers, and some files truncated or mangled. The checks are plain. The reader never throws. A read is either refused with a reason or yields walls of positive finite length. Every opening sits inside its wall. The takeoff runs on the result.

It failed on 7 of 300 drawings. A door or window line whose midpoint was on a wall but whose end ran past the wall's end (or was longer than the whole wall) became an opening that hung off the wall, such as 226 in + 17 in on a 240 in wall. The framing count downstream would have trusted that. `dxf.mjs` now trims such an opening to the wall and adds a note telling the user to check the width.

The test uses invented drawings only. It says nothing about how real architect files behave; that still needs real DXFs.
