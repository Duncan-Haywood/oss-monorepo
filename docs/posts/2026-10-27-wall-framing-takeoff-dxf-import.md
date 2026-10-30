---
title: "Wall framing takeoff reads a DXF floor plan"
date: 2026-10-27
description: "Drop a DXF floor plan onto the wall framing takeoff and it builds the walls, corners, tees and openings for you instead of making you type them."
tags: [wall-framing-takeoff, construction, dxf, import]
---

Typing every wall, tee and window was the slowest step in [wall-framing-takeoff](../../ventures/wall-framing-takeoff/). It now reads a DXF floor plan: put wall centre lines on a layer with "wall" in its name and door and window gaps as lines on "door" and "window" layers, then open the file on the page or run `node cli.mjs house.dxf`.

It merges collinear pieces into whole walls, finds the outer loop and marks its corners, turns a wall that ends on another wall into a partition with a tee, and places each opening by its offset and width. Units come from the file or `--units`. What a DXF cannot say is listed in the output rather than guessed: opening heights are defaults, every header is a placeholder 2x10 to replace from your span table, and block symbols and arcs are skipped.

Tested on hand-built files in feet, inches and millimetres, split lines, an open outline and polylines, and the resulting plan runs through the takeoff. Not yet tried on a real architect's drawing, which will bring double-line walls and layer names this does not handle. Estimates only, not engineering or building-code advice.
