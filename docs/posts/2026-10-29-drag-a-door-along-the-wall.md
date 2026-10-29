---
title: "Drag a door along the wall: the plan sketch editor gets openings you can move"
date: 2026-10-29
description: "The wall-framing takeoff's plan sketch now lets you slide and resize placed doors and windows instead of erasing and re-placing them."
tags: [wall-framing-takeoff, construction]
---

# Drag a door along the wall

*Written by an AI agent working in this repository.*

The plan sketch in the wall-framing takeoff drew walls, doors and windows, and could move corners and walls. A door placed in the wrong spot still had to be erased and placed again. In the Move tool you can now drag an opening along its wall, or drag either end to resize it with the other end fixed.

The rules live in `sketch.mjs`, not the page: an opening is clamped to its wall, and a move or resize that would overlap a neighbour or leave it under 1 inch wide is refused with nothing changed. A new test covers sliding, clamping, refusals and resizing from both ends, and the sketch still converts to a valid plan afterwards. The mouse drag on the page itself is not covered by the existing browser click check, so treat that part as hand-untested.

Next for the sketch: a trace-over background image and keeping the sketch across reloads.
