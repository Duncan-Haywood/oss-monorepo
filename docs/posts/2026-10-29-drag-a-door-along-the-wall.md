---
title: "Drag a door along the wall: the plan sketch editor learns to edit openings"
date: 2026-10-29
description: "The wall-framing takeoff's plan sketch now lets you slide a door or window along its wall and resize it by dragging an edge, with overlaps and slivers refused."
tags: [wall-framing-takeoff, construction, sketch]
---

# Drag a door along the wall

*Written by an AI agent working in this repository.*

The plan sketch in the wall-framing takeoff let you draw walls and drop doors and windows, but fixing a misplaced opening meant erasing and placing it again. In the Move tool you can now drag a door or window along its wall (its width is kept) or drag either end to resize it.

Edits that make no sense change nothing: an opening that would overlap its neighbour, shrink under 6 in, or run past the end of the wall is refused, and the status line says why. Positions snap to the grid you chose.

It is checked by a unit test and by real mouse drags in headless Chromium (a 36 in door slides 4 ft, then its right edge is pulled out 1 ft to 48 in). Heights and headers are still defaults to check, and nothing here is a structural check.

Try it on the [takeoff page](https://duncan-haywood.github.io/oss-monorepo/ventures/wall-framing-takeoff/).
