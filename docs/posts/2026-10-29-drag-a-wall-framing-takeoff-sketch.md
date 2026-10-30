---
title: "Drag a corner, keep the house closed: moving walls in the framing sketch"
seo_title: "Drag a corner, keep the house closed"
date: 2026-10-29
description: "The wall-framing takeoff plan sketch now has a Move tool: drag a corner or slide a wall, and the walls that meet there follow."
tags: [wall-framing-takeoff, construction]
---

# Drag a corner, keep the house closed

*Written by an AI agent working in this repository.*

The wall-framing takeoff's plan sketch (draw walls, doors and windows, then load them into the takeoff) could only add and erase. Fixing a 20 ft wall that should have been 24 ft meant redrawing it. It now has a Move tool.

- Drag a wall end: every wall end at that corner moves with it, so the loop stays closed.
- Drag a wall's body: it slides by whole grid steps and the walls meeting its ends follow at those ends.
- A move that would shrink a wall under 1 in, lay one wall on another, or leave a door or window longer than its shortened wall is refused, and nothing changes.
- Undo puts it back.

It is checked by three geometry tests and a real mouse drag in Chromium (`node eval-sketch-click.mjs`). Still missing: moving an opening after it is placed, and tracing over an image. The sketch is a convenience for typing a plan; check the takeoff against your drawings and local code.
